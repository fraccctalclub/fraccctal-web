// Corre una vez por día (netlify.toml) y manda el recordatorio a quien
// empezó el alta de fundadora hace entre 24 y 48 horas y todavía no
// completó el pago.

const { runFounderReminder } = require("./lib/founder-reminder-core");

exports.handler = async () => {
  try {
    const result = await runFounderReminder(process.env);
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
