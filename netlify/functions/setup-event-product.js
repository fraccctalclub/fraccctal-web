// TEMPORAL — se ejecuta una sola vez a mano para crear el producto y los dos
// precios en Stripe (early bird 20€, general 25€) del taller "Una vida de
// fantasía", en el modo (test o live) que corresponda a STRIPE_SECRET_KEY.
// Devuelve los price IDs para pegarlos en create-event-checkout.js.
// Borrar este archivo después de usarlo.
//
// Uso: https://fraccctal.com/.netlify/functions/setup-event-product?secret=TU_SYNC_SECRET

exports.handler = async (event) => {
  const { STRIPE_SECRET_KEY, SYNC_SECRET } = process.env;
  const secret = event.queryStringParameters?.secret;
  if (!SYNC_SECRET || secret !== SYNC_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) };
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

  const product = await stripePost("products", {
    name: "Una vida de fantasía — Taller con Marta Argüelles",
    description: "Sábado 26 de septiembre de 2026, 11:00–14:00, Rito · Lavapiés, Madrid.",
  });
  if (product.error) {
    return { statusCode: 500, body: JSON.stringify({ error: product.error }) };
  }

  const earlyPrice = await stripePost("prices", {
    product: product.id,
    unit_amount: "2000",
    currency: "eur",
    nickname: "Early bird",
  });

  const generalPrice = await stripePost("prices", {
    product: product.id,
    unit_amount: "2500",
    currency: "eur",
    nickname: "General",
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      keyStartsWith: STRIPE_SECRET_KEY ? STRIPE_SECRET_KEY.slice(0, 8) : null,
      product: product.id,
      earlyPrice: earlyPrice.id,
      generalPrice: generalPrice.id,
    }),
  };
};
