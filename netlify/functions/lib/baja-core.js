// Cierre automático de una baja de socia (fundadora o miembro). Lo dispara el
// webhook de Stripe cuando una suscripción termina (customer.subscription.deleted):
//   1. Supabase: la fila pasa de "active" a "canceled" (pierde acceso y, si era
//      fundadora, libera su plaza del cupo de 20).
//   2. Brevo: sale de la lista "Socixs del club" y se le quita TIPO_SOCIA
//      (el contacto no se borra).
//   3. Notion (base "Socias y compras"): se le quita la etiqueta Fundadora /
//      Miembro de "Compras". La fila y el resto de su historial se conservan.
//   4. Correo a la persona confirmando la baja, con la fecha en que puede volver
//      (si la baja cuenta para el bloqueo de 2 meses) y el enlace a la encuesta.
//   5. Aviso a fraccctal.contact@gmail.com con el resultado de cada paso.
//
// Cada paso va por separado: si uno falla, los demás se hacen igual y el fallo
// aparece en el aviso. Es idempotente: si la fila ya no está activa, no hace
// nada (Stripe puede reintentar el evento).
//
// Variables de entorno: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY,
// NOTION_TOKEN, RESEND_API_KEY

const { avisoInterno } = require("./notify-internal");
const { sendEmail } = require("./send-email");
const { BLOQUEO_DESDE, finDelBloqueo, fechaLarga } = require("./baja-rules");
const { BREVO_LIST_ID } = require("./brevo-socias-core");
const { notionFetch, NOTION_DATABASE_ID, quitarEtiquetasDeFila } = require("./bbdd-core");

const TABLAS = [
  { tabla: "founders", tier: "Fundadora", tablaApp: "founder_applications" },
  { tabla: "members", tier: "Miembro", tablaApp: "member_applications" },
];

function sbHeaders(key, extra = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

// Marca como "canceled" la fila activa que tenga esa suscripción. Devuelve
// [{ tier, tablaApp, email }] (vacío si no había ninguna activa).
async function cancelarEnSupabase(subscriptionId, { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY }, canceladaEn) {
  const encontradas = [];
  for (const t of TABLAS) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${t.tabla}?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}&status=eq.active`,
      {
        method: "PATCH",
        headers: sbHeaders(SUPABASE_SERVICE_ROLE_KEY, { Prefer: "return=representation" }),
        // canceled_at = cuándo terminó de verdad la membresía: de ahí cuentan los 2 meses de bloqueo.
        body: JSON.stringify({ status: "canceled", canceled_at: canceladaEn }),
      }
    );
    if (!res.ok) throw new Error(`Supabase ${t.tabla}: ${res.status}`);
    for (const row of await res.json()) encontradas.push({ ...t, email: row.email });
  }
  return encontradas;
}

// ¿Esta suscripción pertenece a una socia activa nuestra? (para no tocar
// suscripciones ajenas a la membresía)
async function esSuscripcionDeSocia(subscriptionId, { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY }) {
  for (const t of TABLAS) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${t.tabla}?select=email&stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}&status=eq.active`,
      { headers: sbHeaders(SUPABASE_SERVICE_ROLE_KEY) }
    );
    if (res.ok && (await res.json()).length > 0) return true;
  }
  return false;
}

async function limpiarBrevo(email, BREVO_API_KEY) {
  const h = { "api-key": BREVO_API_KEY, "Content-Type": "application/json" };
  const rm = await fetch(`https://api.brevo.com/v3/contacts/lists/${BREVO_LIST_ID}/contacts/remove`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ emails: [email] }),
  });
  // 400 = el contacto no estaba en la lista: tampoco es un fallo
  if (!rm.ok && rm.status !== 400) throw new Error(`Brevo quitar de lista: ${rm.status}`);
  const put = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
    method: "PUT",
    headers: h,
    body: JSON.stringify({ attributes: { TIPO_SOCIA: "" } }),
  });
  if (!put.ok && put.status !== 404) throw new Error(`Brevo limpiar atributo: ${put.status}`);
}

async function limpiarNotion(email, tags, NOTION_TOKEN) {
  const data = await notionFetch(`/databases/${NOTION_DATABASE_ID}/query`, {
    NOTION_TOKEN,
    method: "POST",
    body: { filter: { property: "Email", email: { equals: email } } },
  });
  let cambiadas = 0;
  for (const page of data.results) {
    if (await quitarEtiquetasDeFila(page, tags, NOTION_TOKEN)) cambiadas++;
  }
  return cambiadas;
}

async function nombreDe(email, tablaApp, { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY }) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${tablaApp}?select=nombre,apellido&email=ilike.${encodeURIComponent(email)}&order=created_at.desc&limit=1`,
      { headers: sbHeaders(SUPABASE_SERVICE_ROLE_KEY) }
    );
    const [a] = res.ok ? await res.json() : [];
    return a ? `${a.nombre || ""} ${a.apellido || ""}`.trim() : "";
  } catch {
    return "";
  }
}

// Encuesta de salida (Google Forms). Anónima: no pide nombre ni email.
const ENCUESTA_BAJA_URL = "https://docs.google.com/forms/d/e/1FAIpQLSeszUlOanQ11jy1rJudSr530sSsqWqD35Rmh2WESyEvgMXRyA/viewform";

function escHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function bajaEmailHtml({ nombre, canceladaEn, esFundadora = false }) {
  const saludo = nombre ? `Hola, ${escHtml(nombre)}:` : "Hola:";
  const cuenta = new Date(canceladaEn) >= BLOQUEO_DESDE;
  const vuelta = cuenta
    ? `<p>Como te avisamos, podrás volver a darte de alta a partir del <strong>${fechaLarga(finDelBloqueo(canceladaEn))}</strong> (dos meses desde que termina tu membresía), como miembro general. Hasta entonces no podrás apuntarte a encuentros ni talleres, que son solo para la comunidad.${esFundadora ? " La condición de fundadora no se recupera." : ""}</p>`
    : esFundadora
    ? `<p>Si algún día quieres volver, podrás darte de alta de nuevo como miembro general (22 €/mes) en <a href="https://fraccctal.com/membresia.html">fraccctal.com/membresia.html</a>. La condición de fundadora no se recupera, y con ella tampoco el precio de 11 €.</p>`
    : `<p>Si algún día quieres volver, puedes darte de alta de nuevo cuando quieras en <a href="https://fraccctal.com/membresia.html">fraccctal.com/membresia.html</a>.</p>`;
  const encuesta = ENCUESTA_BAJA_URL.startsWith("http")
    ? `<p>Si tienes dos minutos, nos ayuda muchísimo saber qué pasó, sobre todo lo que podríamos haber hecho distinto. Es una encuesta corta y no te pide ni el nombre ni el email: <a href="${ENCUESTA_BAJA_URL}">responder la encuesta</a>.</p>`
    : "";
  return `
    <p>${saludo}</p>
    <p>Hemos registrado tu baja de Fraccctal. Gracias por haber estado.</p>
    ${vuelta}
    ${encuesta}
    <p>Si fue sin querer o tienes cualquier duda, responde a este correo: nos llega directamente a Irina y a Nat.</p>
    <p>Con cariño,<br>Irina y Nat<br>Fraccctal · club, comunidad, cambio</p>
  `;
}

async function procesarBaja(subscription, env) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY, NOTION_TOKEN } = env;
  // Fin real de la suscripción (Stripe lo informa en ended_at); si faltara, ahora.
  const finUnix = subscription.ended_at || subscription.canceled_at;
  const canceladaEn = (finUnix ? new Date(finUnix * 1000) : new Date()).toISOString();
  const filas = await cancelarEnSupabase(subscription.id, { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY }, canceladaEn);
  if (filas.length === 0) return { procesada: false };

  const resultados = [];
  for (const fila of filas) {
    const pasos = [["Supabase", "ok"]];

    try {
      if (!BREVO_API_KEY) throw new Error("falta BREVO_API_KEY");
      await limpiarBrevo(fila.email, BREVO_API_KEY);
      pasos.push(["Brevo (Socixs del club)", "ok"]);
    } catch (err) {
      console.error("baja: Brevo falló", err.message);
      pasos.push(["Brevo (Socixs del club)", `FALLÓ: ${err.message}`]);
    }

    try {
      if (!NOTION_TOKEN) throw new Error("falta NOTION_TOKEN");
      const n = await limpiarNotion(fila.email, [fila.tier], NOTION_TOKEN);
      pasos.push(["Notion (Socias y compras)", n ? "ok" : "no estaba en la base"]);
    } catch (err) {
      console.error("baja: Notion falló", err.message);
      pasos.push(["Notion (Socias y compras)", `FALLÓ: ${err.message}`]);
    }

    const nombre = await nombreDe(fila.email, fila.tablaApp, { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY });

    try {
      if (!env.RESEND_API_KEY) throw new Error("falta RESEND_API_KEY");
      const primerNombre = nombre.split(" ")[0] || "";
      const r = await sendEmail(env.RESEND_API_KEY, {
        kind: "baja_confirmacion",
        to: fila.email,
        subject: "Hemos registrado tu baja",
        html: bajaEmailHtml({ nombre: primerNombre, canceladaEn, esFundadora: fila.tier === "Fundadora" }),
      });
      pasos.push(["Correo de confirmación de baja", r?.ok ? "ok" : "FALLÓ: Resend rechazó el envío"]);
    } catch (err) {
      console.error("baja: correo falló", err.message);
      pasos.push(["Correo de confirmación de baja", `FALLÓ: ${err.message}`]);
    }

    const motivo = subscription.cancellation_details?.reason || "";
    const hayFallos = pasos.some(([, r]) => r.startsWith("FALLÓ"));
    await avisoInterno({
      kind: "aviso_interno_baja",
      subject: `${hayFallos ? "Baja con fallos" : "Baja"} de ${fila.tier.toLowerCase()}: ${nombre || fila.email}`,
      intro: `Se ha dado de baja una ${fila.tier.toLowerCase()} y el cierre automático ha corrido.${fila.tier === "Fundadora" ? " Su plaza de fundadora queda liberada." : ""}`,
      pares: [
        ["Nombre", nombre],
        ["Email", fila.email],
        ["Tipo", fila.tier],
        ["Motivo en Stripe", motivo],
        ["Cuenta para el bloqueo de 2 meses", new Date(canceladaEn) >= BLOQUEO_DESDE ? `sí, puede volver a partir del ${fechaLarga(finDelBloqueo(canceladaEn))}` : "no (baja anterior al 30 de diciembre de 2026)"],
        ...pasos.map(([paso, r]) => [paso, r]),
      ],
    });
    resultados.push({ email: fila.email, tier: fila.tier, pasos });
  }
  return { procesada: true, resultados };
}

module.exports = { procesarBaja, esSuscripcionDeSocia, bajaEmailHtml };
