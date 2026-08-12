// TEMPORAL — crea los precios de fundadora (11€/mes) y miembro (22€/mes) en
// el modo actual de STRIPE_SECRET_KEY (ahora live), y de paso confirma si
// los price IDs viejos ya configurados existen en ese modo. Borrar después.
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

  async function stripePost(path, params) {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params).toString(),
    });
    return res.json();
  }

  const [founderCheck, memberCheck] = await Promise.all([
    checkPrice(STRIPE_FOUNDER_PRICE_ID),
    checkPrice(STRIPE_MEMBER_PRICE_ID),
  ]);

  let newFounderPrice = null;
  let newMemberPrice = null;

  if (!founderCheck.exists) {
    const product = await stripePost("products", { name: "Membresía Fundadora — Fraccctal" });
    const price = await stripePost("prices", {
      product: product.id,
      unit_amount: "1100",
      currency: "eur",
      "recurring[interval]": "month",
    });
    newFounderPrice = price.id;
  }

  if (!memberCheck.exists) {
    const product = await stripePost("products", { name: "Membresía General — Fraccctal" });
    const price = await stripePost("prices", {
      product: product.id,
      unit_amount: "2200",
      currency: "eur",
      "recurring[interval]": "month",
    });
    newMemberPrice = price.id;
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      keyStartsWith: STRIPE_SECRET_KEY ? STRIPE_SECRET_KEY.slice(0, 8) : null,
      founderPrice: founderCheck,
      memberPrice: memberCheck,
      newFounderPrice,
      newMemberPrice,
      webhookSecretConfigured: !!STRIPE_WEBHOOK_SECRET,
    }),
  };
};
