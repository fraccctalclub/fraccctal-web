// Aviso de diciembre a las fundadoras: el 3 de enero empieza la cuota de 11 €
// y, si después se dan de baja, no pueden volver a entrar como fundadoras.
// Sale el 30 de diciembre de 2026 (ver [functions."founder-billing-notice"]
// en netlify.toml).
//
// Destinatarias: fundadoras con status "active" Y suscripción de Stripe. Quien
// está activa pero sin suscripción (acceso de cortesía) no va a pagar, así que
// no se le avisa de un cobro.
//
// Es idempotente: antes de enviar se leen los envíos ya registrados en
// email_log con este kind, así que correrlo dos veces no manda nada doble.
//
// Variables de entorno necesarias:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY

const { sendEmail, NOTIFICACION_EMAIL } = require("./send-email");
const { avisoInterno } = require("./notify-internal");

const KIND = "aviso_cobro_fundadora";
const ASUNTO = "Tu cuota de fundadora empieza el 3 de enero";
const ESPACIO_SOCIXS_URL = "https://fraccctal.com/preventa.html";

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function avisoHtml(nombre) {
  const saludo = nombre ? `Hola, ${esc(nombre)}:` : "Hola:";
  return `
    <p>${saludo}</p>
    <p>Te escribimos, como te prometimos, para avisarte de que el 3 de enero empieza tu cuota de fundadora. Hasta hoy no has pagado nada, y no tienes que hacer nada para seguir: ese día se cobrarán 11 € a la tarjeta con la que te apuntaste, y después 11 € cada mes.</p>
    <p>Esos 11 € son para siempre, mientras sigas siendo socia. Es la mitad de la cuota general (22 €) y no sube aunque el precio general cambie.</p>
    <p>Hay una cosa que preferimos decirte claro desde ahora: ser fundadora es un lugar que no se puede volver a ocupar. El cupo está cerrado, así que si en algún momento te das de baja y más adelante quieres volver, entrarías como miembro general, a 22 € al mes, y no como fundadora. Tus 11 € se mantienen mientras no interrumpas tu membresía.</p>
    <p>Si prefieres no continuar, puedes darte de baja tú misma, sin dar explicaciones, desde <a href="${ESPACIO_SOCIXS_URL}">tu espacio de socixs</a> (entras con tu email y pulsas "Darme de baja"). Si lo haces antes del 3 de enero, la baja es inmediata y no se te cobra nada.</p>
    <p>Gracias por haber estado desde el principio. Si tienes cualquier duda, responde a este correo: nos llega directamente a Irina y a Nat.</p>
    <p>Con cariño,<br>Irina y Nat<br>Fraccctal · club, comunidad, cambio</p>
  `;
}

// modo: "enviar" (real), "lista" (solo devuelve a quién se enviaría) o
// "prueba" (manda UN correo de muestra a la bandeja de Fraccctal).
async function runFounderBillingNotice(env, { modo = "enviar" } = {}) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY } = env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY) {
    throw new Error("Faltan variables de entorno (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / RESEND_API_KEY)");
  }

  if (modo === "prueba") {
    const r = await sendEmail(RESEND_API_KEY, {
      kind: "prueba_aviso_cobro_fundadora",
      to: NOTIFICACION_EMAIL,
      subject: `[PRUEBA] ${ASUNTO}`,
      html: avisoHtml("Nombre de prueba"),
    });
    return { modo, enviado_a: NOTIFICACION_EMAIL, ok: Boolean(r?.ok) };
  }

  const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
  const leer = async (ruta, que) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${ruta}`, { headers });
    if (!res.ok) throw new Error(`Error leyendo ${que}: ${res.status}`);
    return res.json();
  };

  // Si cualquiera de estas lecturas falla se aborta sin enviar nada: mejor
  // no avisar que avisar dos veces o a quien no corresponde.
  const fundadoras = await leer(
    "founders?select=email&status=eq.active&stripe_subscription_id=not.is.null",
    "founders"
  );
  const yaEnviados = await leer(
    `email_log?select=to_email&kind=eq.${KIND}&status=eq.sent`,
    "email_log"
  );
  const solicitudes = await leer(
    "founder_applications?select=email,nombre,created_at&order=created_at.desc",
    "founder_applications"
  );

  const enviados = new Set(yaEnviados.map((r) => (r.to_email || "").trim().toLowerCase()));
  const nombres = new Map();
  for (const s of solicitudes) {
    const clave = (s.email || "").trim().toLowerCase();
    if (clave && !nombres.has(clave)) nombres.set(clave, s.nombre);
  }

  const pendientes = [];
  const vistas = new Set();
  for (const f of fundadoras) {
    const clave = (f.email || "").trim().toLowerCase();
    if (!clave || vistas.has(clave) || enviados.has(clave)) continue;
    vistas.add(clave);
    pendientes.push({ email: f.email.trim(), nombre: nombres.get(clave) || "" });
  }

  if (modo === "lista") {
    return { modo, pendientes: pendientes.length, ya_enviados: enviados.size, emails: pendientes.map((p) => p.email) };
  }

  const ok = [];
  const fallidos = [];
  for (const p of pendientes) {
    try {
      const r = await sendEmail(RESEND_API_KEY, { kind: KIND, to: p.email, subject: ASUNTO, html: avisoHtml(p.nombre) });
      (r?.ok ? ok : fallidos).push(p.email);
    } catch {
      fallidos.push(p.email);
    }
  }

  await avisoInterno({
    kind: "aviso_interno_aviso_cobro",
    subject: `Aviso de cobro a fundadoras: ${ok.length} enviados${fallidos.length ? `, ${fallidos.length} fallidos` : ""}`,
    intro: "Se ha enviado el aviso de que el 3 de enero empieza la cuota de fundadora.",
    pares: [
      ["Enviados", ok.length],
      ["Fallidos", fallidos.length ? fallidos.join(", ") : ""],
      ["Ya enviados antes", enviados.size],
    ],
  });

  return { modo, enviados: ok.length, fallidos, ya_enviados: enviados.size };
}

module.exports = { runFounderBillingNotice, avisoHtml, KIND, ASUNTO };
