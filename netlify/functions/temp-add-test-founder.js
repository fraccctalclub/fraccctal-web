// TEMPORAL — inserta/activa una fila de prueba en `founders`, sin pasar por
// Stripe, para poder probar el gate de socias. Borrar este archivo después
// de usarlo (y borrar la fila de Supabase cuando termine la prueba).
//
// Uso: https://fraccctal.com/.netlify/functions/temp-add-test-founder?secret=TU_SYNC_SECRET&email=alguien@example.com

exports.handler = async (event) => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SYNC_SECRET } = process.env;
  const secret = event.queryStringParameters?.secret;
  if (!SYNC_SECRET || secret !== SYNC_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) };
  }
  const email = event.queryStringParameters?.email;
  if (!email) {
    return { statusCode: 400, body: JSON.stringify({ error: "Falta ?email=" }) };
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/founders`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({ email, status: "active" }),
  });

  const data = await res.json();
  return { statusCode: res.ok ? 200 : 500, body: JSON.stringify(data) };
};
