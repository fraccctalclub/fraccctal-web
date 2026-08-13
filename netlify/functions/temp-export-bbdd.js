// TEMPORAL — arma un resumen consolidado por persona (nombre, apellido,
// email, teléfono, y qué compró: membresía y/o entradas a encuentros) para
// volcarlo a la BBDD de Notion. Borrar después de usarlo.
//
// Uso: https://fraccctal.com/.netlify/functions/temp-export-bbdd?secret=TU_SYNC_SECRET

async function getAll(table, select, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${select}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) return [];
  return res.json();
}

exports.handler = async (event) => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SYNC_SECRET } = process.env;
  const secret = event.queryStringParameters?.secret;
  if (!SYNC_SECRET || secret !== SYNC_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) };
  }

  const [founders, members, founderApps, memberApps, tickets] = await Promise.all([
    getAll("founders", "email,status,created_at", SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
    getAll("members", "email,status,created_at", SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
    getAll("founder_applications", "email,nombre,apellido,telefono,created_at", SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
    getAll("member_applications", "email,nombre,apellido,telefono,created_at", SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
    getAll("event_tickets", "email,event_id,ticket_tier,status,created_at", SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
  ]);

  // La aplicación más reciente por email gana (por si mandó el form más de una vez).
  function latestByEmail(rows) {
    const map = {};
    for (const r of rows) {
      const key = (r.email || "").toLowerCase();
      if (!key) continue;
      if (!map[key] || new Date(r.created_at) > new Date(map[key].created_at)) {
        map[key] = r;
      }
    }
    return map;
  }
  const founderAppByEmail = latestByEmail(founderApps);
  const memberAppByEmail = latestByEmail(memberApps);

  const people = {};

  function ensurePerson(email) {
    const key = email.toLowerCase();
    if (!people[key]) {
      people[key] = { email: key, nombre: "", apellido: "", telefono: "", compras: [] };
    }
    return people[key];
  }

  for (const f of founders) {
    if (f.status !== "active" || !f.email) continue;
    const p = ensurePerson(f.email);
    const app = founderAppByEmail[f.email.toLowerCase()];
    if (app) {
      p.nombre = p.nombre || app.nombre || "";
      p.apellido = p.apellido || app.apellido || "";
      p.telefono = p.telefono || app.telefono || "";
    }
    p.compras.push("Fundadora");
  }

  for (const m of members) {
    if (m.status !== "active" || !m.email) continue;
    const p = ensurePerson(m.email);
    const app = memberAppByEmail[m.email.toLowerCase()];
    if (app) {
      p.nombre = p.nombre || app.nombre || "";
      p.apellido = p.apellido || app.apellido || "";
      p.telefono = p.telefono || app.telefono || "";
    }
    p.compras.push("Miembro");
  }

  const eventNames = { "una-vida-de-fantasia-2026-09": "Una vida de fantasía" };
  for (const t of tickets) {
    if (t.status !== "paid" || !t.email) continue;
    const p = ensurePerson(t.email);
    const nombreEvento = eventNames[t.event_id] || t.event_id;
    const tierLabel = t.ticket_tier === "early" ? "early bird" : t.ticket_tier;
    p.compras.push(`${nombreEvento} (${tierLabel})`);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ total: Object.keys(people).length, personas: Object.values(people) }, null, 2),
  };
};
