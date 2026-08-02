// Guarda la aplicación de la fundadora y crea una Stripe Checkout Session de
// suscripción para la membresía. No cobra nada hoy: el cobro real empieza el
// 3 de enero de 2027 para todas, sin importar el día en que cada una se anota
// (subscription_data.trial_end fijo).
//
// Variables de entorno necesarias (configurar en Netlify, nunca en el repo):
//   STRIPE_SECRET_KEY, STRIPE_FOUNDER_PRICE_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const FOUNDER_CAP = 20;

// 3 de enero de 2027, 00:00 hora de Madrid (CET = UTC+1 en enero) = 2027-01-02T23:00:00Z
const TRIAL_END_TIMESTAMP = Math.floor(Date.parse("2027-01-02T23:00:00Z") / 1000);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REQUIRED_TEXT_FIELDS = [
  "nombre",
  "apellido",
  "telefono",
  "ciudad",
  "que_te_trae",
  "expectativa",
  "como_te_entero",
];

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Método no permitido" }) };
  }

  const { STRIPE_SECRET_KEY, STRIPE_FOUNDER_PRICE_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } =
    process.env;

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Body inválido" }) };
  }

  const { email, edad, barrio, compartir, acepta_privacidad, acepta_codigo_conducta } = body;

  if (!email || !EMAIL_RE.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Email inválido" }) };
  }
  if (REQUIRED_TEXT_FIELDS.some((field) => !body[field])) {
    return { statusCode: 400, body: JSON.stringify({ error: "Faltan campos obligatorios" }) };
  }
  if (!acepta_privacidad || !acepta_codigo_conducta) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Hay que aceptar la privacidad y el código de conducta" }),
    };
  }

  // 1. Chequear el cupo: contar fundadoras ya activas en Supabase.
  const countRes = await fetch(
    `${SUPABASE_URL}/rest/v1/founders?select=id&status=eq.active`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  if (!countRes.ok) {
    return { statusCode: 500, body: JSON.stringify({ error: "No se pudo consultar el cupo" }) };
  }
  const founders = await countRes.json();
  if (founders.length >= FOUNDER_CAP) {
    return { statusCode: 409, body: JSON.stringify({ error: "cupo_completo" }) };
  }

  // 2. Guardar la aplicación (quién es, qué la trae) antes de ir a pagar.
  await fetch(`${SUPABASE_URL}/rest/v1/founder_applications`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      nombre: body.nombre,
      apellido: body.apellido,
      telefono: body.telefono,
      edad: edad ? Number(edad) : null,
      ciudad: body.ciudad,
      barrio: barrio || null,
      que_te_trae: body.que_te_trae,
      expectativa: body.expectativa,
      compartir: compartir || null,
      como_te_entero: body.como_te_entero,
      acepta_privacidad: true,
      acepta_codigo_conducta: true,
    }),
  });

  // 3. Crear la Checkout Session en Stripe (API REST directa, sin el SDK de Stripe).
  const origin = event.headers.origin || "https://fraccctal.com";
  const params = new URLSearchParams({
    mode: "subscription",
    customer_email: email,
    "line_items[0][price]": STRIPE_FOUNDER_PRICE_ID,
    "line_items[0][quantity]": "1",
    "subscription_data[trial_end]": String(TRIAL_END_TIMESTAMP),
    success_url: `${origin}/.netlify/functions/founder-auto-login?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/membresia.html?fundadora=cancelado`,
  });

  const sessionRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const session = await sessionRes.json();
  if (!sessionRes.ok) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: session.error?.message || "Error de Stripe" }),
    };
  }

  return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
};
