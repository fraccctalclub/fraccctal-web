// Aviso por email a fraccctal.contact@gmail.com cada vez que alguien se
// inscribe en algo de la web (solicitudes de alta, regalo del poema, etc.).
// Nunca rompe el flujo de la persona: si falla, solo lo deja en el log.
// Cada aviso queda registrado en email_log.

const { sendEmail, NOTIFICACION_EMAIL } = require("./send-email");

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// pares: [["Nombre", "Ana"], ["Email", "ana@..."], ...] — se omiten los vacíos
async function avisoInterno({ kind, subject, intro, pares }) {
  const { RESEND_API_KEY } = process.env;
  if (!RESEND_API_KEY) return;
  try {
    const items = pares
      .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
      .map(([k, v]) => `<li>${esc(k)}: ${esc(v)}</li>`)
      .join("");
    await sendEmail(RESEND_API_KEY, {
      kind,
      to: NOTIFICACION_EMAIL,
      subject,
      html: `<p>${esc(intro)}</p><ul>${items}</ul>`,
    });
  } catch (err) {
    console.error(`aviso interno "${kind}" falló`, err.message);
  }
}

// Datos del formulario de alta (fundadora / miembro) que llegan en el body.
function paresSolicitud(body, email) {
  return [
    ["Nombre", `${body.nombre || ""} ${body.apellido || ""}`.trim()],
    ["Email", email],
    ["Teléfono", body.telefono],
    ["Edad", body.edad],
    ["Ciudad", [body.ciudad, body.barrio && `(${body.barrio})`].filter(Boolean).join(" ")],
    ["Qué la trae", body.que_te_trae],
    ["Expectativa", body.expectativa],
    ["Cómo se enteró", body.como_te_entero],
  ];
}

module.exports = { avisoInterno, paresSolicitud };
