// Crea una Stripe Checkout Session de pago único para una entrada del
// taller "Una vida de fantasía". Dos tiers disponibles en simultáneo desde
// el día uno (no se desbloquea "general" recién cuando se agota "early") —
// cada uno con su propio cupo, chequeado contra Supabase antes de crear la
// sesión.
//
// Variables de entorno necesarias:
//   STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const EVENT_ID = "una-vida-de-fantasia-2026-09";

const TIERS = {
  early: { price: "price_1U3ctnCYD2PjyybiZbCg8QLC", cap: 4 },
  general: { price: "price_1U3ctoCYD2PjyybiNYSOYNe4", cap: 12 },
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Método no permitido" }) };
  }

  const { STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Body inválido" }) };
  }

  const tier = body.tier;
  const config = TIERS[tier];
  if (!config) {
    return { statusCode: 400, body: JSON.stringify({ error: "Tier inválido" }) };
  }

  // Chequear cupo: contar entradas ya pagadas de este tier.
  const countRes = await fetch(
    `${SUPABASE_URL}/rest/v1/event_tickets?select=id&event_id=eq.${EVENT_ID}&ticket_tier=eq.${tier}&status=eq.paid`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  if (!countRes.ok) {
    return { statusCode: 500, body: JSON.stringify({ error: "No se pudo consultar el cupo" }) };
  }
  const sold = await countRes.json();
  if (sold.length >= config.cap) {
    return { statusCode: 409, body: JSON.stringify({ error: "agotado" }) };
  }

  const origin = event.headers.origin || "https://fraccctal.com";
  const params = new URLSearchParams({
    mode: "payment",
    "line_items[0][price]": config.price,
    "line_items[0][quantity]": "1",
    "metadata[tier]": "event",
    "metadata[event_id]": EVENT_ID,
    "metadata[ticket_tier]": tier,
    success_url: `${origin}/encuentros/una-vida-de-fantasia?compra=ok`,
    cancel_url: `${origin}/encuentros/una-vida-de-fantasia?compra=cancelado`,
  });

  const sessionRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const session = await sessionRes.json();
  if (!sessionRes.ok) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: session.error?.message || "Error de Stripe" }),
    };
  }

  return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
};
