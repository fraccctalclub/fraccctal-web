// Endpoint público (GET) que devuelve cuántas entradas quedan de cada tier
// del taller, para que la página pueda mostrar "quedan X" y deshabilitar el
// botón cuando se agote.
//
// La sala tiene 16 plazas (ROOM_CAP), y "amigxs" vende 2 plazas por compra
// —así que además del tope propio de cada tier, se respeta el tope real de
// la sala contando las plazas ya vendidas por todos los tiers juntos.

const EVENT_ID = "una-vida-de-fantasia-2026-09";
const ROOM_CAP = 16;
const TIERS = {
  early: { cap: 4, seats: 1 },
  general: { cap: 12, seats: 1 },
  amigxs: { cap: 8, seats: 2 },
};

exports.handler = async () => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/event_tickets?select=ticket_tier&event_id=eq.${EVENT_ID}&status=eq.paid`,
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
  const sold = { early: 0, general: 0, amigxs: 0 };
  rows.forEach((r) => {
    if (sold[r.ticket_tier] !== undefined) sold[r.ticket_tier]++;
  });

  const plazasVendidas = Object.keys(TIERS).reduce((sum, t) => sum + sold[t] * TIERS[t].seats, 0);
  const plazasQuedan = Math.max(0, ROOM_CAP - plazasVendidas);

  const resultado = {};
  for (const tier of Object.keys(TIERS)) {
    const { cap, seats } = TIERS[tier];
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
