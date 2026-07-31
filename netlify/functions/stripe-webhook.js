// Recibe la confirmación de pago de Stripe (checkout.session.completed), guarda
// a la fundadora en Supabase y le manda su primer magic link de acceso.
//
// Configurar en el dashboard de Stripe (modo test primero): Developers → Webhooks →
// Add endpoint → https://fraccctal.com/.netlify/functions/stripe-webhook
// evento a escuchar: checkout.session.completed
//
// Variables de entorno necesarias:
//   STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const crypto = require("crypto");

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

exports.handler = async (event) => {
  const { STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

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
    }
  }

  return { statusCode: 200, body: "ok" };
};
