// Recibe la confirmación de pago de Stripe (checkout.session.completed), guarda
// a la fundadora en Supabase, le manda su primer magic link de acceso (de
// respaldo, el acceso principal ya lo dio founder-auto-login.js) y el email
// de bienvenida con la carta de las fundadoras y los links a la comunidad.
//
// Configurar en el dashboard de Stripe (modo test primero): Developers → Webhooks →
// Add endpoint → https://fraccctal.com/.netlify/functions/stripe-webhook
// evento a escuchar: checkout.session.completed
//
// Variables de entorno necesarias:
//   STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY

const crypto = require("crypto");

// EDITAR: pegar acá el link del canal de difusión de WhatsApp y el link para
// crear la cuenta en el DFOS (con una frase corta de qué es cada cosa, si querés
// cambiar el texto de abajo también se puede).
const WHATSAPP_LINK = "PEGAR_LINK_WHATSAPP_AQUI";
const DFOS_LINK = "PEGAR_LINK_DFOS_AQUI";

// EDITAR: esta es la carta de bienvenida de las fundadoras. Reemplazar este
// texto por el definitivo — se manda tal cual, en HTML simple (un <p> por
// párrafo).
const CARTA_FUNDADORAS = `
  <p>[PEGAR ACÁ LA CARTA DE LAS FUNDADORAS]</p>
`;

function verifyStripeSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;

  const parts = {};
  for (const piece of signatureHeader.split(",")) {
    const [key, value] = piece.split("=");
    parts[key] = value;
  }
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const gotBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== gotBuf.length) return false;
  if (!crypto.timingSafeEqual(expectedBuf, gotBuf)) return false;

  // Rechazar eventos de más de 5 minutos, evita ataques de repetición.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  return age <= 300;
}

async function sendWelcomeEmail(email, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY) {
  if (!RESEND_API_KEY) return;

  let nombre = "";
  try {
    const appRes = await fetch(
      `${SUPABASE_URL}/rest/v1/founder_applications?select=nombre&email=eq.${encodeURIComponent(email)}&order=created_at.desc&limit=1`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    const rows = await appRes.json();
    nombre = rows[0]?.nombre || "";
  } catch {
    // Si falla, mandamos el email igual sin el nombre.
  }

  const saludo = nombre ? `Hola ${nombre},` : "Hola,";

  const html = `
    <p>${saludo}</p>
    <p>¡Bienvenida a Fraccctal! Ya sos fundadora.</p>
    ${CARTA_FUNDADORAS}
    <p><a href="${WHATSAPP_LINK}">Sumate al canal de difusión de WhatsApp</a>, ahí vamos a avisar las novedades y fechas.</p>
    <p><a href="${DFOS_LINK}">Creá tu cuenta en el DFOS</a>, nuestro espacio de comunidad online donde vamos a seguir en contacto entre encuentro y encuentro.</p>
    <p>Cualquier cosa, respondé este email.</p>
  `;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Fraccctal <hola@fraccctal.com>",
      to: email,
      subject: "Bienvenida a Fraccctal",
      html,
    }),
  });
}

exports.handler = async (event) => {
  const { STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY } =
    process.env;

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;

  const signatureHeader = event.headers["stripe-signature"];
  if (!verifyStripeSignature(rawBody, signatureHeader, STRIPE_WEBHOOK_SECRET)) {
    return { statusCode: 400, body: "Firma inválida" };
  }

  const stripeEvent = JSON.parse(rawBody);

  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object;
    const email = session.customer_email || (session.customer_details && session.customer_details.email);

    if (email) {
      // Guardar (o actualizar) la fila de la fundadora. Requiere que la columna
      // "email" tenga una restricción UNIQUE en Supabase para que el upsert funcione.
      await fetch(`${SUPABASE_URL}/rest/v1/founders`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          email,
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
          status: "active",
        }),
      });

      // Disparar un magic link de respaldo (por si vuelve otro día desde otro
      // dispositivo). El primer acceso normalmente ya lo dio founder-auto-login.js
      // directo desde el pago, sin pasar por el email.
      const redirectTo = encodeURIComponent("https://fraccctal.com/preventa.html");
      await fetch(`${SUPABASE_URL}/auth/v1/otp?redirect_to=${redirectTo}`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, create_user: true }),
      });

      await sendWelcomeEmail(email, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY);
    }
  }

  return { statusCode: 200, body: "ok" };
};
