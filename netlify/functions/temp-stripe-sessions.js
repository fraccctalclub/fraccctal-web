// TEMPORAL — lista todas las Checkout Sessions completadas de Stripe, para
// cruzar contra la lista de cargos y detectar algo que se nos haya escapado.
// Borrar después de usarlo.
//
// Uso: https://fraccctal.com/.netlify/functions/temp-stripe-sessions?secret=TU_SYNC_SECRET

exports.handler = async (event) => {
  const { STRIPE_SECRET_KEY, SYNC_SECRET } = process.env;
  const secret = event.queryStringParameters?.secret;
  if (!SYNC_SECRET || secret !== SYNC_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) };
  }

  const sessions = [];
  let startingAfter = "";
  for (let i = 0; i < 10; i++) {
    const params = new URLSearchParams({ limit: "100" });
    if (startingAfter) params.set("starting_after", startingAfter);
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions?${params.toString()}`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    });
    const data = await res.json();
    if (!res.ok) return { statusCode: 500, body: JSON.stringify({ error: data.error?.message }) };
    sessions.push(...data.data);
    if (!data.has_more || data.data.length === 0) break;
    startingAfter = data.data[data.data.length - 1].id;
  }

  const resumen = sessions.map((s) => ({
    id: s.id,
    status: s.status,
    payment_status: s.payment_status,
    email: s.customer_details?.email || s.customer_email || null,
    amount_total: s.amount_total ? s.amount_total / 100 : null,
    mode: s.mode,
    created: new Date(s.created * 1000).toISOString(),
  }));

  return { statusCode: 200, body: JSON.stringify({ total: resumen.length, sesiones: resumen }, null, 2) };
};
