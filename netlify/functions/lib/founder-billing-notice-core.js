// Aviso de diciembre a las socias: el 3 de enero empieza la cuota.
//  - Fundadoras: 11 €/mes para siempre y, si después se dan de baja, no pueden
//    volver a entrar como fundadoras.
//  - Miembros: 22 €/mes.
// Sale el 30 de diciembre de 2026 (ver [functions."founder-billing-notice"]
// en netlify.toml).
//
// Destinatarias: socias con status "active" Y suscripción de Stripe. Quien
// está activa pero sin suscripción (acceso de cortesía) no va a pagar, así que
// no se le avisa de un cobro.
//
// Es idempotente: antes de enviar se leen los envíos ya registrados en
// email_log con el kind de cada grupo, así que correrlo dos veces no manda nada
// doble.
//
// Variables de entorno necesarias:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY

const { sendEmail, NOTIFICACION_EMAIL } = require("./send-email");
const { avisoInterno } = require("./notify-internal");

const KIND = "aviso_cobro_fundadora"; // se mantiene el kind original de las fundadoras
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

function avisoMiembroHtml(nombre) {
  const saludo = nombre ? `Hola, ${esc(nombre)}:` : "Hola:";
  return `
    <p>${saludo}</p>
    <p>Te escribimos, como te contamos al apuntarte, para avisarte de que el 3 de enero empieza tu cuota de miembro. Hasta hoy no has pagado nada, y no tienes que hacer nada para seguir: ese día se cobrarán 22 € a la tarjeta con la que te apuntaste, y después 22 € cada mes.</p>
    <p>Con tu membresía tienes acceso a todos los talleres y encuentros de Fraccctal, al club de lectura y al walking club, descuentos con nuestra red de terapeutas y talleristas, y tu lugar en la comunidad online. Desde enero los talleres son solo para socixs.</p>
    <p>Si prefieres no continuar, puedes darte de baja tú misma, sin dar explicaciones, desde <a href="${ESPACIO_SOCIXS_URL}">tu espacio de socixs</a> (entras con tu email y pulsas "Darme de baja"). Si lo haces antes del 3 de enero, la baja es inmediata y no se te cobra nada. Después de esa fecha también puedes hacerlo ahí, y sigues como socia hasta el final del periodo que ya hayas abonado.</p>
    <p>Gracias por estar. Si tienes cualquier duda, responde a este correo: nos llega directamente a Irina y a Nat.</p>
    <p>Con cariño,<br>Irina y Nat<br>Fraccctal · club, comunidad, cambio</p>
  `;
}

// Cada grupo: de qué tabla salen las socias, de cuál su nombre, qué kind se
// registra en email_log (para no reenviar) y qué asunto y texto reciben.
const GRUPOS = [
  { nombre: "fundadoras", cuenta: "founders", solicitudes: "founder_applications", kind: KIND, asunto: ASUNTO, html: avisoHtml },
  {
    nombre: "miembros",
    cuenta: "members",
    solicitudes: "member_applications",
    kind: "aviso_cobro_miembro",
    asunto: "Tu cuota de miembro empieza el 3 de enero",
    html: avisoMiembroHtml,
  },
];

// modo: "enviar" (real), "lista" (solo devuelve a quién se enviaría) o
// "prueba" (manda UN correo de muestra de cada grupo a la bandeja de Fraccctal).
async function runFounderBillingNotice(env, { modo = "enviar" } = {}) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY } = env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY) {
    throw new Error("Faltan variables de entorno (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / RESEND_API_KEY)");
  }

  if (modo === "prueba") {
    const resultados = [];
    for (const g of GRUPOS) {
      const r = await sendEmail(RESEND_API_KEY, {
        kind: `prueba_${g.kind}`,
        to: NOTIFICACION_EMAIL,
        subject: `[PRUEBA ${g.nombre}] ${g.asunto}`,
        html: g.html("Nombre de prueba"),
      });
      resultados.push({ grupo: g.nombre, ok: Boolean(r?.ok) });
    }
    return { modo, enviado_a: NOTIFICACION_EMAIL, resultados };
  }

  const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
  const leer = async (ruta, que) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${ruta}`, { headers });
    if (!res.ok) throw new Error(`Error leyendo ${que}: ${res.status}`);
    return res.json();
  };

  // Primero se lee todo, de todos los grupos. Si cualquier lectura falla se
  // aborta sin enviar nada: mejor no avisar que avisar dos veces o a quien no
  // corresponde.
  const preparados = [];
  for (const g of GRUPOS) {
    const cuentas = await leer(
      `${g.cuenta}?select=email&status=eq.active&stripe_subscription_id=not.is.null`,
      g.cuenta
    );
    const yaEnviados = await leer(`email_log?select=to_email&kind=eq.${g.kind}&status=eq.sent`, "email_log");
    const solicitudes = await leer(`${g.solicitudes}?select=email,nombre,created_at&order=created_at.desc`, g.solicitudes);

    const enviados = new Set(yaEnviados.map((r) => (r.to_email || "").trim().toLowerCase()));
    const nombres = new Map();
    for (const s of solicitudes) {
      const clave = (s.email || "").trim().toLowerCase();
      if (clave && !nombres.has(clave)) nombres.set(clave, s.nombre);
    }

    const pendientes = [];
    const vistas = new Set();
    for (const c of cuentas) {
      const clave = (c.email || "").trim().toLowerCase();
      if (!clave || vistas.has(clave) || enviados.has(clave)) continue;
      vistas.add(clave);
      pendientes.push({ email: c.email.trim(), nombre: nombres.get(clave) || "" });
    }
    preparados.push({ g, pendientes, yaEnviados: enviados.size });
  }

  if (modo === "lista") {
    return {
      modo,
      grupos: preparados.map(({ g, pendientes, yaEnviados }) => ({
        grupo: g.nombre,
        pendientes: pendientes.length,
        ya_enviados: yaEnviados,
        emails: pendientes.map((p) => p.email),
      })),
    };
  }

  const resumen = [];
  for (const { g, pendientes, yaEnviados } of preparados) {
    const ok = [];
    const fallidos = [];
    for (const p of pendientes) {
      try {
        const r = await sendEmail(RESEND_API_KEY, { kind: g.kind, to: p.email, subject: g.asunto, html: g.html(p.nombre) });
        (r?.ok ? ok : fallidos).push(p.email);
      } catch {
        fallidos.push(p.email);
      }
    }
    resumen.push({ grupo: g.nombre, enviados: ok.length, fallidos, ya_enviados: yaEnviados });
  }

  const total = resumen.reduce((n, r) => n + r.enviados, 0);
  const fallidosTotal = resumen.reduce((n, r) => n + r.fallidos.length, 0);
  await avisoInterno({
    kind: "aviso_interno_aviso_cobro",
    subject: `Aviso de cobro a socias: ${total} enviados${fallidosTotal ? `, ${fallidosTotal} fallidos` : ""}`,
    intro: "Se ha enviado el aviso de que el 3 de enero empieza la cuota.",
    pares: resumen.flatMap((r) => [
      [`Enviados (${r.grupo})`, r.enviados],
      [`Fallidos (${r.grupo})`, r.fallidos.join(", ")],
      [`Ya enviados antes (${r.grupo})`, r.ya_enviados],
    ]),
  });

  return { modo, resumen };
}

module.exports = { runFounderBillingNotice, avisoHtml, avisoMiembroHtml, KIND, ASUNTO };
