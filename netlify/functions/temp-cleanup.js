// TEMPORAL — 1) borra la fila de prueba de irinatrash@gmail.com en founders,
// 2) corrige el email en founder_applications de Valentina. Borrar después.
//
// Uso: https://fraccctal.com/.netlify/functions/temp-cleanup?secret=TU_SYNC_SECRET

exports.handler = async (event) => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SYNC_SECRET } = process.env;
  const secret = event.queryStringParameters?.secret;
  if (!SYNC_SECRET || secret !== SYNC_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) };
  }

  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  const del = await fetch(`${SUPABASE_URL}/rest/v1/founders?email=eq.irinatrash@gmail.com`, {
    method: "DELETE",
    headers,
  });
  const delData = await del.json();

  const patch = await fetch(
    `${SUPABASE_URL}/rest/v1/founder_applications?email=eq.valentibapaez93@gmail.com`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ email: "valentinapaez93@gmail.com" }),
    }
  );
  const patchData = await patch.json();

  return { statusCode: 200, body: JSON.stringify({ borrado: delData, corregido: patchData }) };
};
