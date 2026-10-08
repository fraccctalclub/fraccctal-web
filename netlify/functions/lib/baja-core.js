// Cierre automático de una baja de socia (fundadora o miembro). Lo dispara el
// webhook de Stripe cuando una suscripción termina (customer.subscription.deleted):
//   1. Supabase: la fila pasa de "active" a "canceled" (pierde acceso y, si era
//      fundadora, libera su plaza del cupo de 20).
//   2. Brevo: sale de la lista "Socixs del club" y se le quita TIPO_SOCIA
//      (el contacto no se borra).
//   3. Notion (base "Socias y compras"): se le quita la etiqueta Fundadora /
//      Miembro de "Compras". La fila y el resto de su historial se conservan.
//   4. Aviso a fraccctal.contact@gmail.com con el resultado de cada paso.
//
// Cada paso va por separado: si uno falla, los demás se hacen igual y el fallo
// aparece en el aviso. Es idempotente: si la fila ya no está activa, no hace
// nada (Stripe puede reintentar el evento).
//
// Variables de entorno: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY,
// NOTION_TOKEN, RESEND_API_KEY

const { avisoInterno } = require("./notify-internal");
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
async function cancelarEnSupabase(subscriptionId, { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY }) {
  const encontradas = [];
  for (const t of TABLAS) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${t.tabla}?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}&status=eq.active`,
      {
        method: "PATCH",
        headers: sbHeaders(SUPABASE_SERVICE_ROLE_KEY, { Prefer: "return=representation" }),
        body: JSON.stringify({ status: "canceled" }),
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

async function procesarBaja(subscription, env) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY, NOTION_TOKEN } = env;
  const filas = await cancelarEnSupabase(subscription.id, { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY });
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
        ...pasos.map(([paso, r]) => [paso, r]),
      ],
    });
    resultados.push({ email: fila.email, tier: fila.tier, pasos });
  }
  return { procesada: true, resultados };
}

module.exports = { procesarBaja, esSuscripcionDeSocia };
