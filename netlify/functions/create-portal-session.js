// Crea una sesión del Portal de Cliente de Stripe para que una socia
// (fundadora o miembro) pueda gestionar su propia suscripción: cancelarla,
// actualizar el método de pago, ver el historial de cobros. No requiere que
// construyamos ninguna pantalla propia — la aloja Stripe.
//
// Se llama desde preventa.html, con el email ya verificado por
// checkMembership en el navegador. Igual lo volvemos a verificar acá,
// server-side, antes de crear la sesión.
//
// Variables de entorno necesarias:
//   STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function findStripeCustomerId(email, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) {
  for (const table of ["founders", "members"]) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=stripe_customer_id&status=eq.active&email=eq.${encodeURIComponent(email)}`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    if (!res.ok) continue;
    const rows = await res.json();
    if (rows[0]?.stripe_customer_id) return rows[0].stripe_customer_id;
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Método no permitido" }) };
  }

  const { STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

  let email;
  try {
    ({ email } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Body inválido" }) };
  }
  email = (email || "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Email inválido" }) };
  }

  const customerId = await findStripeCustomerId(email, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  if (!customerId) {
    return { statusCode: 404, body: JSON.stringify({ error: "no_encontrada" }) };
  }

  const origin = event.headers.origin || "https://fraccctal.com";
  const params = new URLSearchParams({
    customer: customerId,
    return_url: `${origin}/preventa.html`,
  });

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
