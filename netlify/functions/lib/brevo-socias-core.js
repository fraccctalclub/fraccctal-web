// Mantiene la lista de Brevo "Socixs del club" (id 6) al día con quienes
// son fundadorxs o miembros activxs en Supabase: las suma con nombre/
// apellido/tipo, y saca de la lista a quien ya no esté activa (se dio de
// baja) — sin borrar el contacto de Brevo, solo lo desvincula de esta
// lista puntual.
//
// Variables de entorno necesarias:
//   BREVO_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const BREVO_LIST_ID = 6; // "Socixs del club"

function brevoHeaders(BREVO_API_KEY) {
  return { "api-key": BREVO_API_KEY, "Content-Type": "application/json" };
}

async function getAllSupabase(table, select, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${select}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Error leyendo ${table}: ${res.status}`);
  return res.json();
}

// Última aplicación (nombre/apellido) por email, de founder_applications o
// member_applications — puede haber más de una fila por persona si mandó
// el formulario más de una vez, nos quedamos con la más reciente.
function ultimaPorEmail(rows) {
  const porEmail = {};
  for (const row of rows) {
    const actual = porEmail[row.email];
    if (!actual || new Date(row.created_at) > new Date(actual.created_at)) {
      porEmail[row.email] = row;
    }
  }
  return porEmail;
}

async function getActiveSocias(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) {
  const [founders, members, founderApps, memberApps] = await Promise.all([
    getAllSupabase("founders", "email,status", SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
    getAllSupabase("members", "email,status", SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
    getAllSupabase("founder_applications", "email,nombre,apellido,created_at", SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
    getAllSupabase("member_applications", "email,nombre,apellido,created_at", SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
  ]);

  const founderAppsPorEmail = ultimaPorEmail(founderApps);
  const memberAppsPorEmail = ultimaPorEmail(memberApps);

  const socias = [];
  for (const f of founders) {
    if (f.status !== "active") continue;
    const app = founderAppsPorEmail[f.email];
    socias.push({ email: f.email, nombre: app?.nombre || "", apellido: app?.apellido || "", tipo: "Fundadorx" });
  }
  for (const m of members) {
    if (m.status !== "active") continue;
    const app = memberAppsPorEmail[m.email];
    socias.push({ email: m.email, nombre: app?.nombre || "", apellido: app?.apellido || "", tipo: "Miembro" });
  }
  return socias;
}

async function upsertContacto(socia, BREVO_API_KEY) {
  await fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: brevoHeaders(BREVO_API_KEY),
    body: JSON.stringify({
      email: socia.email,
      attributes: { NOMBRE: socia.nombre, APELLIDOS: socia.apellido, TIPO_SOCIA: socia.tipo },
      listIds: [BREVO_LIST_ID],
      updateEnabled: true,
    }),
  });
}

// Trae todos los emails que hoy están en la lista de Brevo (paginado).
async function getEmailsEnLista(BREVO_API_KEY) {
  const emails = [];
  let offset = 0;
  const limit = 500;
  while (true) {
    const res = await fetch(
      `https://api.brevo.com/v3/contacts/lists/${BREVO_LIST_ID}/contacts?limit=${limit}&offset=${offset}`,
      { headers: brevoHeaders(BREVO_API_KEY) }
    );
    if (!res.ok) break;
    const data = await res.json();
    const contactos = data.contacts || [];
    for (const c of contactos) emails.push(c.email);
    if (contactos.length < limit) break;
    offset += limit;
  }
  return emails;
}

async function quitarDeLista(emails, BREVO_API_KEY) {
  if (!emails.length) return;
  await fetch(`https://api.brevo.com/v3/contacts/lists/${BREVO_LIST_ID}/contacts/remove`, {
    method: "POST",
    headers: brevoHeaders(BREVO_API_KEY),
    body: JSON.stringify({ emails }),
  });
}

async function runBrevoSociasSync(env) {
  const { BREVO_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env;
  if (!BREVO_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Faltan variables de entorno (BREVO_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }

  const socias = await getActiveSocias(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const emailsActivos = new Set(socias.map((s) => s.email.toLowerCase()));

  for (const socia of socias) {
    await upsertContacto(socia, BREVO_API_KEY);
  }

  const emailsEnLista = await getEmailsEnLista(BREVO_API_KEY);
  const aQuitar = emailsEnLista.filter((email) => !emailsActivos.has(email.toLowerCase()));
  await quitarDeLista(aQuitar, BREVO_API_KEY);

  return {
    sincronizadas: socias.length,
    quitadas: aQuitar.length,
    total_en_lista_antes: emailsEnLista.length,
  };
}

module.exports = { runBrevoSociasSync, getActiveSocias, BREVO_LIST_ID };
