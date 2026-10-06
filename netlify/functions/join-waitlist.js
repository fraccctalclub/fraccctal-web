// Lista de espera de un encuentro agotado. Guarda a la persona en Supabase
// (tabla lista_espera, para respetar el orden de llegada), en la lista de
// Brevo del encuentro (para poder escribirle si se libera una plaza) y, solo
// la primera vez que se apunta, le manda un email de confirmación que la
// invita a hacerse socia. El email queda registrado en email_log.
//
// Para abrir lista de espera en otro encuentro: crear la lista en Brevo y
// añadir una entrada en WAITLIST_EVENTS.
//
// Variables de entorno: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY,
// RESEND_API_KEY

const { sendEmail, NOTIFICACION_EMAIL } = require("./lib/send-email");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FOUNDER_CAP = 20;

const WAITLIST_EVENTS = {
  "la-erotica-del-buentrato-2026-10": {
    brevoList: 10,
    titulo: "La erótica del buentrato",
    fecha: "sábado 24 de octubre",
  },
};

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// true = quedan plazas de fundadora, false = cupo completo, null = no se pudo saber
async function quedanPlazasFundadora(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/founders?select=id&status=eq.active&counts_toward_cap=is.true`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    if (!res.ok) return null;
    return (await res.json()).length < FOUNDER_CAP;
  } catch {
    return null;
  }
}

function emailHtml({ nombre, ev, plazasFundadora }) {
  const oferta =
    plazasFundadora === true
      ? `<p>Ahora mismo todavía quedan plazas de fundadora: la membresía es gratis hasta el 31 de diciembre de 2026 y, desde el 3 de enero de 2027, cuesta 11 €/mes, precio de fundadora para siempre. No se cobra nada antes y puedes darte de baja cuando quieras.</p>`
      : plazasFundadora === false
      ? `<p>El cupo de fundadoras ya se completó, pero puedes entrar a la membresía general: es gratis hasta el 3 de enero de 2027 y después cuesta 22 €/mes. Puedes darte de baja cuando quieras.</p>`
      : `<p>Las condiciones de la membresía, con su precio y fechas, están en la página.</p>`;

  return `
    <p>Hola, ${escapeHtml(nombre)}:</p>
    <p>Gracias por apuntarte. Ya estás en la lista de espera de <strong>${ev.titulo}</strong> (${ev.fecha}).</p>
    <p>Las plazas se agotaron. Si se libera alguna, te escribimos a este mismo correo, por orden de llegada. No podemos prometerte que ocurra, pero te avisamos en cuanto pase.</p>
    <p>Si quieres asegurarte un lugar en los próximos talleres, hay una forma: hacerte socia. Las socias entran antes a la preventa de cada taller, y a partir de enero los talleres serán solo para la comunidad: ya no los abriremos por fuera.</p>
    ${oferta}
    <p>Puedes verla y apuntarte aquí: <a href="https://fraccctal.com/membresia.html">https://fraccctal.com/membresia.html</a></p>
    <p>Si prefieres no hacerlo, no pasa nada: tu lugar en la lista sigue igual.</p>
    <p>Cualquier duda, responde a este correo y te contestamos nosotras directamente. Somos dos personas, no un buzón automático.</p>
    <p>Irina y Nat<br>Fraccctal</p>
  `;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Método no permitido" }) };
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY, RESEND_API_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !BREVO_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "config" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Body inválido" }) };
  }

  const eventId = String(body.event || "");
  const email = String(body.email || "").trim().toLowerCase();
  const nombre = String(body.nombre || "").trim().slice(0, 100);

  if (!Object.prototype.hasOwnProperty.call(WAITLIST_EVENTS, eventId)) {
    return { statusCode: 400, body: JSON.stringify({ error: "evento_sin_lista" }) };
  }
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return { statusCode: 400, body: JSON.stringify({ error: "email_invalido" }) };
  }
  if (!nombre) {
    return { statusCode: 400, body: JSON.stringify({ error: "nombre_requerido" }) };
  }
  const ev = WAITLIST_EVENTS[eventId];

  // 1) Supabase: el orden de llegada. Si ya estaba anotada (índice único) no
  // se inserta nada, no se pisa su posición y no se le vuelve a escribir.
  const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/lista_espera`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=representation",
    },
    body: JSON.stringify({ event_id: eventId, email, nombre }),
  });
  if (!sbRes.ok) {
    console.error("lista_espera: Supabase respondió", sbRes.status);
    return { statusCode: 502, body: JSON.stringify({ error: "no_guardado" }) };
  }
  let nuevaEnLista = false;
  try {
    const rows = await sbRes.json();
    nuevaEnLista = Array.isArray(rows) && rows.length > 0;
  } catch {
    // sin body legible: no mandamos email por si acaso fuera un duplicado
  }

  // 2) Brevo: para poder escribirle. Si falla, ya quedó guardada en Supabase,
  // así que no se lo mostramos como error a la persona.
  try {
    const brevoRes = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        attributes: { NOMBRE: nombre },
        listIds: [ev.brevoList],
        updateEnabled: true,
      }),
    });
    if (!brevoRes.ok && brevoRes.status !== 204) {
      console.error("lista_espera: Brevo respondió", brevoRes.status);
    }
  } catch (err) {
    console.error("lista_espera: Brevo falló", err.message);
  }

  // 3) Email de confirmación + invitación a ser socia (solo la primera vez).
  // Un fallo aquí tampoco es un error para la persona: ya está en la lista.
  if (nuevaEnLista && RESEND_API_KEY) {
    try {
      const plazasFundadora = await quedanPlazasFundadora(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await sendEmail(RESEND_API_KEY, {
        kind: "lista_espera",
        to: email,
        subject: `Estás en la lista de espera · ${ev.titulo}`,
        html: emailHtml({ nombre, ev, plazasFundadora }),
      });
    } catch (err) {
      console.error("lista_espera: email falló", err.message);
    }
  }

  // 4) Aviso interno a Irina, también solo la primera vez.
  if (nuevaEnLista && RESEND_API_KEY) {
    try {
      const countRes = await fetch(
        `${SUPABASE_URL}/rest/v1/lista_espera?select=id&event_id=eq.${encodeURIComponent(eventId)}`,
        { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
      );
      const puesto = countRes.ok ? (await countRes.json()).length : null;
      await sendEmail(RESEND_API_KEY, {
        kind: "aviso_interno_lista_espera",
        to: NOTIFICACION_EMAIL,
        subject: `Lista de espera · ${ev.titulo}: ${nombre}`,
        html: `<p>Nueva persona en la lista de espera de <strong>${ev.titulo}</strong>.</p><ul><li>Nombre: ${escapeHtml(nombre)}</li><li>Email: ${escapeHtml(email)}</li>${puesto ? `<li>Puesto en la lista: ${puesto}</li>` : ""}</ul>`,
      });
    } catch (err) {
      console.error("lista_espera: aviso interno falló", err.message);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
