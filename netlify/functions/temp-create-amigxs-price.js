// Uso único: busca el producto de Stripe al que pertenece el precio "early"
// ya existente, y crea ahí mismo un nuevo precio de 42€ (2 plazas) para el
// tier "amigxs". Se borra este archivo apenas se corre una vez.

exports.handler = async () => {
  const { STRIPE_SECRET_KEY } = process.env;
  if (!STRIPE_SECRET_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Falta STRIPE_SECRET_KEY" }) };
  }

  const headers = { Authorization: `Bearer ${STRIPE_SECRET_KEY}` };

  const priceRes = await fetch("https://api.stripe.com/v1/prices/price_1U3d6yCYD2PjyybiCY6yxF0l", { headers });
  const priceData = await priceRes.json();
  if (!priceRes.ok) {
    return { statusCode: 500, body: JSON.stringify({ error: priceData.error?.message || "No se pudo leer el precio early" }) };
  }
  const productId = priceData.product;

  const params = new URLSearchParams({
    product: productId,
    unit_amount: "4200",
    currency: "eur",
    "nickname": "Amigxs (2 entradas)",
  });
  const newPriceRes = await fetch("https://api.stripe.com/v1/prices", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const newPrice = await newPriceRes.json();
  if (!newPriceRes.ok) {
    return { statusCode: 500, body: JSON.stringify({ error: newPrice.error?.message || "No se pudo crear el precio" }) };
  }

  return { statusCode: 200, body: JSON.stringify({ product: productId, nuevo_precio: newPrice.id }) };
};
