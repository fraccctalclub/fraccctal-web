// Versión disparable a mano de remind-founder-applications.js — misma
// lógica, pero alcanzable por HTTP público (Netlify bloquea eso en las
// funciones con `schedule`). Protegida con SYNC_SECRET para que no la
// dispare cualquiera.
//
// Uso: https://fraccctal.com/.netlify/functions/remind-founder-applications-manual?secret=TU_SYNC_SECRET

const { runFounderReminder } = require("./lib/founder-reminder-core");

exports.handler = async (event) => {
  const { SYNC_SECRET } = process.env;
  const secret = event.queryStringParameters?.secret;
  if (!SYNC_SECRET || secret !== SYNC_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) };
  }

  try {
    const result = await runFounderReminder(process.env);
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
