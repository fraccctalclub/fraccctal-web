// Se ejecuta sola una vez por semana (ver [functions."sync-substack"] en
// netlify.toml). Netlify bloquea el acceso público por HTTP a las funciones
// programadas, así que no hace falta secreto acá — para disparar la
// sincronización a mano, usar sync-substack-manual.js.
//
// Variables de entorno necesarias: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const { runSync } = require("./lib/sync-core");

exports.handler = async () => {
  try {
    const result = await runSync(process.env);
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
