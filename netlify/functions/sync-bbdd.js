// Se ejecuta sola una vez por semana (ver [functions."sync-bbdd"] en
// netlify.toml). Netlify bloquea el acceso público por HTTP a las funciones
// programadas, así que no hace falta secreto acá — para disparar la
// sincronización a mano, usar sync-bbdd-manual.js.
//
// Variables de entorno necesarias: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NOTION_TOKEN

const { runBbddSync } = require("./lib/bbdd-core");

exports.handler = async () => {
  try {
    const result = await runBbddSync(process.env);
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
