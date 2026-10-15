// Versión disparable a mano de founder-billing-notice.js (fundadoras y miembros), protegida con
// SYNC_SECRET. Tres modos (parámetro `modo`):
//   lista   (por defecto) solo muestra a quién se enviaría, sin enviar nada
//   prueba  manda dos correos de muestra (fundadoras y miembros) a fraccctal.contact@gmail.com
//   enviar  envía de verdad a las fundadoras pendientes (idempotente)
//
// Uso: https://fraccctal.com/.netlify/functions/founder-billing-notice-manual?secret=TU_SYNC_SECRET&modo=prueba

const { runFounderBillingNotice } = require("./lib/founder-billing-notice-core");

exports.handler = async (event) => {
  const { SYNC_SECRET } = process.env;
  const q = event.queryStringParameters || {};
  if (!SYNC_SECRET || q.secret !== SYNC_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) };
  }
  const modo = q.modo || "lista";
  if (!["lista", "prueba", "enviar"].includes(modo)) {
    return { statusCode: 400, body: JSON.stringify({ error: "modo debe ser lista, prueba o enviar" }) };
  }

  try {
    const result = await runFounderBillingNotice(process.env, { modo });
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
