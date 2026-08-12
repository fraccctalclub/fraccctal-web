// TEMPORAL — diagnóstico de solo lectura: confirma si los price IDs ya
// configurados (fundadora, miembro) existen en el modo actual de
// STRIPE_SECRET_KEY. Borrar después de usarlo.
//
// Uso: https://fraccctal.com/.netlify/functions/check-live-prices?secret=TU_SYNC_SECRET

exports.handler = async (event) => {
  const { STRIPE_SECRET_KEY, STRIPE_FOUNDER_PRICE_ID, STRIPE_MEMBER_PRICE_ID, STRIPE_WEBHOOK_SECRET, SYNC_SECRET } =
    process.env;
  const secret = event.queryStringParameters?.secret;
  if (!SYNC_SECRET || secret !== SYNC_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) };
  }

  async function checkPrice(id) {
    if (!id) return { id, exists: false, error: "no configurado" };
    const res = await fetch(`https://api.stripe.com/v1/prices/${id}`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    });
    const data = await res.json();
    return { id, exists: res.ok, error: res.ok ? null : data.error?.message };
  }

  const [founder, member] = await Promise.all([
    checkPrice(STRIPE_FOUNDER_PRICE_ID),
    checkPrice(STRIPE_MEMBER_PRICE_ID),
  ]);

  return {
    statusCode: 200,
    body: JSON.stringify({
      keyStartsWith: STRIPE_SECRET_KEY ? STRIPE_SECRET_KEY.slice(0, 8) : null,
      founderPrice: founder,
      memberPrice: member,
      webhookSecretConfigured: !!STRIPE_WEBHOOK_SECRET,
    }),
  };
};
