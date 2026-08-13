// Lógica compartida: junta socias + compras desde Supabase, y sincroniza esa
// lista contra la base "Socias y compras" de Notion (crea filas nuevas,
// actualiza las existentes, nunca borra nada).

const NOTION_DATABASE_ID = "bf454ec2-7ada-47e1-9f6f-ed06874e8046";
const NOTION_VERSION = "2022-06-28";
const EVENT_NAMES = { "una-vida-de-fantasia-2026-09": "Una vida de fantasía" };

// Trae todos los cargos exitosos y no reembolsados de Stripe (incluye ventas
// viejas de "Una Voz Posible" y "Un Cuerpo Expresivo", vendidas antes de que
// existiera este sistema — la fuente de verdad ahí es Stripe, no Supabase).
async function getStripeCharges(STRIPE_SECRET_KEY) {
  const charges = [];
  let startingAfter = "";
  for (let i = 0; i < 10; i++) {
    const params = new URLSearchParams({ limit: "100" });
    if (startingAfter) params.set("starting_after", startingAfter);
    const res = await fetch(`https://api.stripe.com/v1/charges?${params.toString()}`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    });
    const data = await res.json();
    if (!res.ok) break;
    charges.push(...data.data);
    if (!data.has_more || data.data.length === 0) break;
    startingAfter = data.data[data.data.length - 1].id;
  }
  const succeeded = charges.filter((c) => (c.status === "succeeded" || c.paid) && !c.refunded);

  // Algunos cargos viejos (Payment Links) no traen el email en el propio
  // cargo — hay que ir a buscarlo al customer asociado.
  const customerEmailCache = {};
  for (const c of succeeded) {
    if (c.billing_details?.email || c.receipt_email || !c.customer) continue;
    if (customerEmailCache[c.customer] === undefined) {
      const res = await fetch(`https://api.stripe.com/v1/customers/${c.customer}`, {
        headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
      });
      const data = await res.json();
      customerEmailCache[c.customer] = res.ok ? data.email : null;
    }
    c._customerEmail = customerEmailCache[c.customer];
  }

  return succeeded;
}

// De una descripción tipo `"Un Cuerpo Expresivo" Taller de práctica...`
// se queda solo con el nombre entre comillas. Si no hay comillas, usa la
// descripción completa; si no hay descripción, arma un label genérico.
function compraLabelDeCargo(charge) {
  const desc = charge.description || "";
  const match = desc.match(/^"([^"]+)"/);
  if (match) return match[1];
  if (desc) return desc;
  return `Pago Stripe (${(charge.amount / 100).toFixed(2)}€)`;
}

function splitNombre(fullName) {
  if (!fullName) return { nombre: "", apellido: "" };
  const [nombre, ...resto] = fullName.trim().split(/\s+/);
  return { nombre, apellido: resto.join(" ") };
}

async function getAllSupabase(table, select, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${select}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) return [];
  return res.json();
}

// Arma { email, nombre, apellido, telefono, compras: [] } por cada persona
// activa (fundadora, miembro, o con alguna entrada pagada).
async function buildPersonas(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY) {
  const [founders, members, founderApps, memberApps, tickets, stripeCharges] = await Promise.all([
    getAllSupabase("founders", "email,status,created_at", SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
    getAllSupabase("members", "email,status,created_at", SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
    getAllSupabase("founder_applications", "email,nombre,apellido,telefono,created_at", SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
    getAllSupabase("member_applications", "email,nombre,apellido,telefono,created_at", SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
    getAllSupabase("event_tickets", "email,event_id,ticket_tier,status,created_at", SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
    STRIPE_SECRET_KEY ? getStripeCharges(STRIPE_SECRET_KEY) : Promise.resolve([]),
  ]);

  function latestByEmail(rows) {
    const map = {};
    for (const r of rows) {
      const key = (r.email || "").toLowerCase();
      if (!key) continue;
      if (!map[key] || new Date(r.created_at) > new Date(map[key].created_at)) map[key] = r;
    }
    return map;
  }
  const founderAppByEmail = latestByEmail(founderApps);
  const memberAppByEmail = latestByEmail(memberApps);

  const people = {};
  function ensurePerson(email) {
    const key = email.toLowerCase();
    if (!people[key]) people[key] = { email: key, nombre: "", apellido: "", telefono: "", compras: [] };
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

  for (const t of tickets) {
    if (t.status !== "paid" || !t.email) continue;
    const p = ensurePerson(t.email);
    const nombreEvento = EVENT_NAMES[t.event_id] || t.event_id;
    const tierLabel = t.ticket_tier === "early" ? "early bird" : t.ticket_tier;
    p.compras.push(`${nombreEvento} (${tierLabel})`);
  }

  // Ventas viejas hechas directo en Stripe, de antes de que existiera este
  // sistema (Una Voz Posible, Un Cuerpo Expresivo). Salteamos las que ya
  // vienen del taller nuevo (esas ya están arriba, vía event_tickets).
  for (const c of stripeCharges) {
    const email = c.billing_details?.email || c.receipt_email || c._customerEmail;
    if (!email) continue;
    if (c.description && c.description.startsWith("Una vida de fantasía —")) continue;
    const p = ensurePerson(email);
    if (!p.nombre && !p.apellido) {
      const { nombre, apellido } = splitNombre(c.billing_details?.name);
      p.nombre = p.nombre || nombre;
      p.apellido = p.apellido || apellido;
    }
    const label = compraLabelDeCargo(c);
    if (!p.compras.includes(label)) p.compras.push(label);
  }

  return Object.values(people);
}

async function notionFetch(path, { NOTION_TOKEN, method = "GET", body } = {}) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion API ${path}: ${data.message || res.status}`);
  return data;
}

async function fetchExistingRows(NOTION_TOKEN) {
  const byEmail = {};
  let cursor;
  do {
    const data = await notionFetch(`/databases/${NOTION_DATABASE_ID}/query`, {
      NOTION_TOKEN,
      method: "POST",
      body: cursor ? { start_cursor: cursor } : {},
    });
    for (const page of data.results) {
      const email = page.properties?.Email?.email;
      if (email) byEmail[email.toLowerCase()] = page;
    }
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return byEmail;
}

function comprasIguales(a, b) {
  const sa = [...a].sort().join("|");
  const sb = [...b].sort().join("|");
  return sa === sb;
}

async function syncPersonaToNotion(persona, existingPage, NOTION_TOKEN) {
  const nombreCompleto = `${persona.nombre} ${persona.apellido}`.trim() || persona.email;

  if (!existingPage) {
    await notionFetch("/pages", {
      NOTION_TOKEN,
      method: "POST",
      body: {
        parent: { database_id: NOTION_DATABASE_ID },
        properties: {
          "Nombre completo": { title: [{ text: { content: nombreCompleto } }] },
          Nombre: { rich_text: [{ text: { content: persona.nombre || "" } }] },
          Apellido: { rich_text: [{ text: { content: persona.apellido || "" } }] },
          Email: { email: persona.email },
          Teléfono: persona.telefono ? { phone_number: persona.telefono } : { phone_number: null },
          Compras: { multi_select: persona.compras.map((c) => ({ name: c })) },
        },
      },
    });
    return "creada";
  }

  const props = existingPage.properties;
  const existingCompras = (props.Compras?.multi_select || []).map((o) => o.name);
  const existingNombre = props.Nombre?.rich_text?.[0]?.plain_text || "";
  const existingApellido = props.Apellido?.rich_text?.[0]?.plain_text || "";
  const existingTelefono = props.Teléfono?.phone_number || "";

  const updates = {};
  if (!comprasIguales(existingCompras, persona.compras)) {
    updates.Compras = { multi_select: persona.compras.map((c) => ({ name: c })) };
  }
  if (!existingNombre && persona.nombre) {
    updates.Nombre = { rich_text: [{ text: { content: persona.nombre } }] };
  }
  if (!existingApellido && persona.apellido) {
    updates.Apellido = { rich_text: [{ text: { content: persona.apellido } }] };
  }
  if (!existingTelefono && persona.telefono) {
    updates.Teléfono = { phone_number: persona.telefono };
  }

  if (Object.keys(updates).length === 0) return "sin_cambios";

  await notionFetch(`/pages/${existingPage.id}`, {
    NOTION_TOKEN,
    method: "PATCH",
    body: { properties: updates },
  });
  return "actualizada";
}

async function runBbddSync({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NOTION_TOKEN, STRIPE_SECRET_KEY }) {
  const personas = await buildPersonas(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY);
  const existingByEmail = await fetchExistingRows(NOTION_TOKEN);

  const resumen = { creadas: 0, actualizadas: 0, sin_cambios: 0 };
  for (const persona of personas) {
    const resultado = await syncPersonaToNotion(persona, existingByEmail[persona.email], NOTION_TOKEN);
    resumen[resultado === "creada" ? "creadas" : resultado === "actualizada" ? "actualizadas" : "sin_cambios"]++;
  }

  return { total: personas.length, ...resumen };
}

module.exports = { runBbddSync };
