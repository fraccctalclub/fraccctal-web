// TEMPORAL — lista todos los pagos exitosos en Stripe (modo live) para
// cruzarlos contra lo que ya tenemos en Supabase y detectar compras que no
// quedaron registradas. Borrar después de usarlo.
//
// Uso: https://fraccctal.com/.netlify/functions/temp-stripe-history?secret=TU_SYNC_SECRET

exports.handler = async (event) => {
  const { STRIPE_SECRET_KEY, SYNC_SECRET } = process.env;
  const secret = event.queryStringParameters?.secret;
  if (!SYNC_SECRET || secret !== SYNC_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) };
  }

  const charges = [];
  let startingAfter = "";
  for (let i = 0; i < 10; i++) {
    const params = new URLSearchParams({ limit: "100" });
    if (startingAfter) params.set("starting_after", startingAfter);
    const res = await fetch(`https://api.stripe.com/v1/charges?${params.toString()}`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    });
    const data = await res.json();
    if (!res.ok) {
      return { statusCode: 500, body: JSON.stringify({ error: data.error?.message }) };
    }
    charges.push(...data.data);
    if (!data.has_more || data.data.length === 0) break;
    startingAfter = data.data[data.data.length - 1].id;
  }

  const resumen = charges
    .filter((c) => c.status === "succeeded" || c.paid)
    .map((c) => ({
      id: c.id,
      email: c.billing_details?.email || c.receipt_email || null,
      amount: c.amount / 100,
      currency: c.currency,
      description: c.description,
      created: new Date(c.created * 1000).toISOString(),
      refunded: c.refunded,
    }));

  return { statusCode: 200, body: JSON.stringify({ total: resumen.length, cargos: resumen }, null, 2) };
};
