// TEMPORAL — corrige un email mal cargado en `founders` (typo al pagar).
// Borrar después de usarlo.
//
// Uso: https://fraccctal.com/.netlify/functions/temp-fix-email?secret=TU_SYNC_SECRET&from=viejo@x.com&to=nuevo@x.com

exports.handler = async (event) => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SYNC_SECRET } = process.env;
  const secret = event.queryStringParameters?.secret;
  if (!SYNC_SECRET || secret !== SYNC_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) };
  }
  const from = event.queryStringParameters?.from;
  const to = event.queryStringParameters?.to;
  if (!from || !to) {
    return { statusCode: 400, body: JSON.stringify({ error: "Faltan ?from= y ?to=" }) };
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/founders?email=eq.${encodeURIComponent(from)}`,
    {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ email: to }),
    }
  );

  const data = await res.json();
  return { statusCode: res.ok ? 200 : 500, body: JSON.stringify(data) };
};
