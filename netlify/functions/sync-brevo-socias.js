// Corre una vez por semana (netlify.toml) y mantiene la lista de Brevo
// "Socixs del club" al día con quienes son fundadorxs o miembros activxs.

const { runBrevoSociasSync } = require("./lib/brevo-socias-core");

exports.handler = async () => {
  try {
    const result = await runBrevoSociasSync(process.env);
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
