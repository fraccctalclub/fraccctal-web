// Crea una sesión del Portal de Cliente de Stripe para que una socia
// (fundadora o miembro) pueda gestionar su propia suscripción: cancelarla,
// actualizar el método de pago, ver el historial de cobros. No requiere que
// construyamos ninguna pantalla propia — la aloja Stripe.
//
// Se llama desde preventa.html. El email NO se toma del body: se obtiene de
// la sesión de Supabase de quien llama (Authorization: Bearer <access_token>),
// verificada acá server-side. Así nadie puede abrir el portal de otra socia
// solo conociendo su email.
//
// body.accion === "baja" abre el portal directamente en la pantalla de
// cancelar la suscripción (Stripe flow subscription_cancel); sin acción, abre
// el portal completo. El cierre de la baja (Supabase, Brevo, Notion, aviso)
// lo hace el webhook cuando Stripe confirma que la suscripción terminó.
//
// Variables de entorno necesarias:
//   STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

// Devuelve el email verificado del token, o null si el token no es válido.
async function emailDeSesion(authHeader, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) {
  const token = (authHeader || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user.email ? user.email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

async function findStripeIds(email, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) {
  for (const table of ["founders", "members"]) {
    // Comparación exacta en el código (sin ilike: "_" y "*" funcionan como
    // comodines en las consultas y podrían cruzar emails distintos).
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=email,stripe_customer_id,stripe_subscription_id&status=eq.active`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    if (!res.ok) continue;
    const fila = (await res.json()).find((r) => (r.email || "").trim().toLowerCase() === email);
    if (fila?.stripe_customer_id) {
      return { customerId: fila.stripe_customer_id, subscriptionId: fila.stripe_subscription_id };
    }
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Método no permitido" }) };
  }

  const { STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

  let accion = null;
  try {
    ({ accion } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Body inválido" }) };
  }

  const email = await emailDeSesion(
    event.headers.authorization || event.headers.Authorization,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
  );
  if (!email) {
    return { statusCode: 401, body: JSON.stringify({ error: "sin_sesion" }) };
  }

  const ids = await findStripeIds(email, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  if (!ids) {
    return { statusCode: 404, body: JSON.stringify({ error: "no_encontrada" }) };
  }

  const origin = event.headers.origin || "https://fraccctal.com";
  const params = new URLSearchParams({
    customer: ids.customerId,
    return_url: `${origin}/preventa.html`,
  });
  if (accion === "baja" && ids.subscriptionId) {
    params.set("flow_data[type]", "subscription_cancel");
    params.set("flow_data[subscription_cancel][subscription]", ids.subscriptionId);
    params.set("flow_data[after_completion][type]", "redirect");
    params.set("flow_data[after_completion][redirect][return_url]", `${origin}/preventa.html?baja=ok`);
  }

  const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const session = await res.json();
  if (!res.ok) {
    return { statusCode: 500, body: JSON.stringify({ error: session.error?.message || "Error de Stripe" }) };
  }

  return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
};
