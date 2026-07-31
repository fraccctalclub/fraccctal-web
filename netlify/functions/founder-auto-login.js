// Success URL del checkout de Stripe: confirma que el pago se completó y genera
// una sesión de Supabase directamente (sin pasar por el email) para que la nueva
// fundadora caiga ya logueada en la preventa, en un solo paso.
//
// El webhook (stripe-webhook.js) sigue guardando la fila en Supabase y mandando
// un magic link de respaldo, útil para cuando vuelva otro día desde otro dispositivo.
//
// Variables de entorno necesarias:
//   STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const SITE_URL = "https://fraccctal.com";
const FALLBACK = `${SITE_URL}/membresia.html?fundadora=ok`;

exports.handler = async (event) => {
  const { STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  const sessionId = event.queryStringParameters && event.queryStringParameters.session_id;

  if (!sessionId) {
    return { statusCode: 302, headers: { Location: FALLBACK }, body: "" };
  }

  const sessionRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
  });
  const session = await sessionRes.json();
  const email =
    session.customer_email || (session.customer_details && session.customer_details.email);

  if (!sessionRes.ok || session.payment_status !== "paid" || !email) {
    return { statusCode: 302, headers: { Location: FALLBACK }, body: "" };
  }

  const redirectTo = `${SITE_URL}/preventa.html`;
  const linkRes = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/generate_link?redirect_to=${encodeURIComponent(redirectTo)}`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "magiclink",
        email,
        redirect_to: redirectTo,
      }),
    }
  );
  const linkData = await linkRes.json();
  const actionLink = linkData.properties?.action_link || linkData.action_link;

  if (!linkRes.ok || !actionLink) {
    return { statusCode: 302, headers: { Location: FALLBACK }, body: "" };
  }

  return { statusCode: 302, headers: { Location: actionLink }, body: "" };
};
