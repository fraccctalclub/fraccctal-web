// Uso único: crea los 3 precios de Stripe para "La erótica del buentrato"
// (24 oct), bajo el mismo producto que ya usan las entradas de septiembre.
// Se borra este archivo apenas se corre una vez.

exports.handler = async () => {
  const { STRIPE_SECRET_KEY } = process.env;
  if (!STRIPE_SECRET_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Falta STRIPE_SECRET_KEY" }) };
  }

  const headers = { Authorization: `Bearer ${STRIPE_SECRET_KEY}` };

  // Mismo producto que las entradas de "Una vida de fantasía".
  const priceRes = await fetch("https://api.stripe.com/v1/prices/price_1U3d6yCYD2PjyybiCY6yxF0l", { headers });
  const priceData = await priceRes.json();
  if (!priceRes.ok) {
    return { statusCode: 500, body: JSON.stringify({ error: priceData.error?.message || "No se pudo leer el precio de referencia" }) };
  }
  const productId = priceData.product;

  const specs = [
    { key: "early", amount: "2000", nickname: "Oct · Erótica del buentrato · Early bird" },
    { key: "general", amount: "2500", nickname: "Oct · Erótica del buentrato · General" },
    { key: "amigxs", amount: "4200", nickname: "Oct · Erótica del buentrato · Amigxs (2 entradas)" },
  ];

  const resultado = {};
  for (const spec of specs) {
    const params = new URLSearchParams({
      product: productId,
      unit_amount: spec.amount,
      currency: "eur",
      nickname: spec.nickname,
    });
    const res = await fetch("https://api.stripe.com/v1/prices", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const data = await res.json();
    if (!res.ok) {
      return { statusCode: 500, body: JSON.stringify({ error: data.error?.message || `No se pudo crear el precio ${spec.key}`, hechos_hasta_ahora: resultado }) };
    }
    resultado[spec.key] = data.id;
  }

  return { statusCode: 200, body: JSON.stringify({ product: productId, precios: resultado }) };
};
