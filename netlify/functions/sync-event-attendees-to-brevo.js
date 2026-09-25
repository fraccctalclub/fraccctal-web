// Uso: https://fraccctal.com/.netlify/functions/sync-event-attendees-to-brevo?secret=TU_SYNC_SECRET&event=ID_DEL_ENCUENTRO&list=ID_DE_LISTA_EN_BREVO
//
// event: el id del encuentro tal como está en netlify/functions/lib/events.js
//        (ej. "una-vida-de-fantasia-2026-09")
// list:  el ID numérico de una lista de Brevo ya creada (vacía) donde
//        queremos que caigan quienes compraron entrada a ese encuentro.

const { runEventAttendeesSync } = require("./lib/brevo-event-attendees-core");

exports.handler = async (event) => {
  const { SYNC_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY } = process.env;
  const params = event.queryStringParameters || {};
  if (!SYNC_SECRET || params.secret !== SYNC_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) };
  }

  try {
    const result = await runEventAttendeesSync({
      eventId: params.event,
      listId: params.list,
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      BREVO_API_KEY,
    });
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
