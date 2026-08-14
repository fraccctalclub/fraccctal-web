// Guarda la aplicación de la miembro general y crea una Stripe Checkout
// Session de suscripción (22€/mes). Hasta el 3 de enero de 2027, gratis
// hasta esa fecha —igual que la fundadora, mismo trial_end fijo—, para que
// cualquiera que se asocie ahora no pague nada hasta entonces. Pasada esa
// fecha (cuando ya no tiene sentido "gratis hasta enero"), vuelve a un
// período de prueba normal de 20 días.
//
// Variables de entorno necesarias:
//   STRIPE_SECRET_KEY, STRIPE_MEMBER_PRICE_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

// 3 de enero de 2027, 00:00 hora de Madrid (CET = UTC+1 en enero) = 2027-01-02T23:00:00Z.
// Mismo timestamp que usa create-checkout-session.js para las fundadoras.
const FREE_UNTIL_TIMESTAMP = Math.floor(Date.parse("2027-01-02T23:00:00Z") / 1000);
const TRIAL_DAYS = 20;

// Versión del texto de condiciones.html que se le pide aceptar a cada
// miembro. Debe coincidir con LEGAL.CONDICIONES_VERSION en
// js/legal-config.js — subirla ahí cuando cambie el contenido legal.
const CONDICIONES_VERSION = "2026-08-v1";

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

  const { STRIPE_SECRET_KEY, STRIPE_MEMBER_PRICE_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } =
    process.env;

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Body inválido" }) };
  }

  const { email, edad, barrio, compartir, acepta_condiciones, acepta_privacidad, acepta_codigo_conducta } =
    body;

  if (!email || !EMAIL_RE.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Email inválido" }) };
  }
  if (REQUIRED_TEXT_FIELDS.some((field) => !body[field])) {
    return { statusCode: 400, body: JSON.stringify({ error: "Faltan campos obligatorios" }) };
  }
  if (!acepta_condiciones || !acepta_privacidad || !acepta_codigo_conducta) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Hay que aceptar las condiciones, la privacidad y el código de conducta",
      }),
    };
  }

  // Guardar la aplicación (quién es, qué la trae) antes de ir a pagar.
  await fetch(`${SUPABASE_URL}/rest/v1/member_applications`, {
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
      acepta_condiciones: true,
      acepta_privacidad: true,
      acepta_codigo_conducta: true,
      condiciones_version: CONDICIONES_VERSION,
    }),
  });

  // Crear la Checkout Session en Stripe (API REST directa, sin el SDK de Stripe).
  const origin = event.headers.origin || "https://fraccctal.com";
  const params = new URLSearchParams({
    mode: "subscription",
    customer_email: email,
    "line_items[0][price]": STRIPE_MEMBER_PRICE_ID,
    "line_items[0][quantity]": "1",
    "metadata[tier]": "member",
    success_url: `${origin}/.netlify/functions/member-auto-login?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/membresia.html?miembro=cancelado`,
  });

  // Antes del 3 de enero de 2027: gratis hasta esa fecha fija (como fundadora).
  // Después: prueba normal de 20 días desde el alta.
  if (Math.floor(Date.now() / 1000) < FREE_UNTIL_TIMESTAMP) {
    params.set("subscription_data[trial_end]", String(FREE_UNTIL_TIMESTAMP));
  } else {
    params.set("subscription_data[trial_period_days]", String(TRIAL_DAYS));
  }

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
