// Único punto de envío de emails vía Resend. Cada intento queda registrado en
// la tabla email_log de Supabase (enviado o fallido, con el id que devuelve
// Resend), para poder comprobar después si un email salió de verdad.
//
// Registrar nunca rompe el flujo: si el log falla, el email igual se envía.
// Si Resend responde con error HTTP se registra como "failed" y NO se lanza
// excepción (igual que antes); si hay un fallo de red se registra y se
// relanza, para que Stripe reintente el webhook como antes.

const NOTIFICACION_EMAIL = "fraccctal.contact@gmail.com";

async function logEmail(row) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/email_log`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });
  } catch (err) {
    console.error("email_log: no se pudo registrar", err.message);
  }
}

async function sendEmail(RESEND_API_KEY, { to, subject, html, kind }) {
  const base = { kind: kind || "otro", to_email: to, subject };
  let res;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Fraccctal <hola@fraccctal.com>",
        reply_to: NOTIFICACION_EMAIL,
        to,
        subject,
        html,
      }),
    });
  } catch (err) {
    console.error(`email "${base.kind}" a ${to}: fallo de red`, err.message);
    await logEmail({ ...base, status: "failed", error: `red: ${err.message}` });
    throw err;
  }

  let body = null;
  try {
    body = await res.json();
  } catch {}

  if (res.ok) {
    await logEmail({ ...base, status: "sent", http_status: res.status, resend_id: body?.id || null });
  } else {
    const error = body?.message || body?.error || `HTTP ${res.status}`;
    console.error(`email "${base.kind}" a ${to}: Resend respondió ${res.status}`, error);
    await logEmail({ ...base, status: "failed", http_status: res.status, error: String(error) });
  }
  return { ok: res.ok, id: body?.id || null };
}

module.exports = { sendEmail, NOTIFICACION_EMAIL };
