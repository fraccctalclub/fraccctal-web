// Endpoint público (GET) que devuelve cuántas entradas quedan de cada tier
// de un encuentro, para que su página pueda mostrar "quedan X" y
// deshabilitar el botón cuando se agote.
//
// El encuentro se indica con ?event=<id> (catálogo en lib/events.js). Sin
// ese parámetro cae en DEFAULT_EVENT_ID, para que una página ya cacheada en
// el navegador de alguien (la de septiembre, que en su momento no mandaba
// ?event=) siga funcionando igual.
//
// Cada encuentro tiene su propio roomCap (plazas físicas de la sala): además
// del tope propio de cada tier, se respeta el tope real de la sala contando
// las plazas ya vendidas por todos los tiers juntos ("amigxs" vende 2 plazas
// por compra).

const { getEvent, DEFAULT_EVENT_ID } = require("./lib/events");

exports.handler = async (event) => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

  const eventId = event.queryStringParameters?.event || DEFAULT_EVENT_ID;
  const eventConfig = getEvent(eventId);
  if (!eventConfig) {
    return { statusCode: 400, body: JSON.stringify({ error: "evento_desconocido" }) };
  }
  const { roomCap, tiers } = eventConfig;

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/event_tickets?select=ticket_tier&event_id=eq.${eventId}&status=eq.paid`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  if (!res.ok) {
    return { statusCode: 500, body: JSON.stringify({ error: "No se pudo consultar el cupo" }) };
  }
  const rows = await res.json();
  const sold = {};
  Object.keys(tiers).forEach((t) => {
    sold[t] = 0;
  });
  rows.forEach((r) => {
    if (sold[r.ticket_tier] !== undefined) sold[r.ticket_tier]++;
  });

  const plazasVendidas = Object.keys(tiers).reduce((sum, t) => sum + sold[t] * tiers[t].seats, 0);
  const plazasQuedan = Math.max(0, roomCap - plazasVendidas);

  const resultado = {};
  for (const tier of Object.keys(tiers)) {
    const { cap, seats } = tiers[tier];
    const quedanPorTope = Math.max(0, cap - sold[tier]);
    const quedanPorSala = Math.floor(plazasQuedan / seats);
    resultado[tier] = { sold: sold[tier], cap, quedan: Math.min(quedanPorTope, quedanPorSala) };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(resultado),
  };
};
