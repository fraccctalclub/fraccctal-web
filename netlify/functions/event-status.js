// Endpoint público (GET) que devuelve cuántas entradas quedan de cada tier
// del taller, para que la página pueda mostrar "quedan X" y deshabilitar el
// botón cuando se agote.

const EVENT_ID = "una-vida-de-fantasia-2026-09";
const CAPS = { early: 4, general: 12 };

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
  const sold = { early: 0, general: 0 };
  rows.forEach((r) => {
    if (sold[r.ticket_tier] !== undefined) sold[r.ticket_tier]++;
  });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      early: { sold: sold.early, cap: CAPS.early, quedan: Math.max(0, CAPS.early - sold.early) },
      general: { sold: sold.general, cap: CAPS.general, quedan: Math.max(0, CAPS.general - sold.general) },
    }),
  };
};
