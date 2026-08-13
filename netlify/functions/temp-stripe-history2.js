// TEMPORAL — como temp-stripe-history pero también busca el email en el
// customer de Stripe cuando el cargo no lo trae directo. Borrar después.
//
// Uso: https://fraccctal.com/.netlify/functions/temp-stripe-history2?secret=TU_SYNC_SECRET

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
    if (!res.ok) return { statusCode: 500, body: JSON.stringify({ error: data.error?.message }) };
    charges.push(...data.data);
    if (!data.has_more || data.data.length === 0) break;
    startingAfter = data.data[data.data.length - 1].id;
  }

  const succeeded = charges.filter((c) => (c.status === "succeeded" || c.paid) && !c.refunded);

  const sinEmail = succeeded.filter((c) => !c.billing_details?.email && !c.receipt_email);

  // Para los que no tienen email directo, buscamos el customer.
  const customerCache = {};
  for (const c of sinEmail) {
    if (!c.customer) continue;
    if (customerCache[c.customer] !== undefined) continue;
    const res = await fetch(`https://api.stripe.com/v1/customers/${c.customer}`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    });
    const data = await res.json();
    customerCache[c.customer] = res.ok ? data.email : null;
  }

  const detalle = sinEmail.map((c) => ({
    id: c.id,
    amount: c.amount / 100,
    description: c.description,
    created: new Date(c.created * 1000).toISOString(),
    customer: c.customer,
    customerEmail: c.customer ? customerCache[c.customer] : null,
    billingName: c.billing_details?.name || null,
  }));

  return {
    statusCode: 200,
    body: JSON.stringify({ totalSucceeded: succeeded.length, sinEmailDirecto: detalle.length, detalle }, null, 2),
  };
};
