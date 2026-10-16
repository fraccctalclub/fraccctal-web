// Corre solo el 30 de diciembre (ver netlify.toml) y avisa a las fundadoras
// (11 €/mes) y a los miembros (22 €/mes) de que el 3 de enero empieza su cuota. Solo actúa en 2026: la
// programación se repite cada 30 de diciembre y no queremos que reenvíe el
// aviso en años siguientes.

const { runFounderBillingNotice } = require("./lib/founder-billing-notice-core");

exports.handler = async () => {
  if (new Date().getUTCFullYear() !== 2026) {
    return { statusCode: 200, body: JSON.stringify({ omitido: "solo se envía en 2026" }) };
  }
  try {
    const result = await runFounderBillingNotice(process.env);
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
