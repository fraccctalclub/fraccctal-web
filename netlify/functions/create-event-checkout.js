// Crea una Stripe Checkout Session para una entrada del taller "Una vida de
// fantasía". Dos tiers disponibles en simultáneo desde el día uno (no se
// desbloquea "general" recién cuando se agota "early") — cada uno con su
// propio cupo, chequeado contra Supabase antes de crear la sesión.
//
// Durante agosto de 2026 la compra es exclusiva para socias (fundadora o
// miembro): hay que mandar el email verificado y se chequea contra Supabase
// acá mismo, server-side (no alcanza con que el frontend lo haya validado).
// Desde el 1 de septiembre se abre a cualquiera, sin email ni membresía.
//
// Además, quien compra una entrada puede sumarse de paso como fundadora sin
// coste (body.hacerse_fundadora=true): en ese caso la Checkout Session pasa
// a mode:"subscription" con DOS line items — la entrada (pago único, se
// cobra ya) y el precio fundadora (recurrente, en trial hasta el 3 de enero
// de 2027, igual que en create-checkout-session.js). Stripe soporta mezclar
// un ítem de una sola vez dentro de una sesión de suscripción: se factura
// de inmediato aunque la suscripción esté en trial.
//
// Variables de entorno necesarias:
//   STRIPE_SECRET_KEY, STRIPE_FOUNDER_PRICE_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const EVENT_ID = "una-vida-de-fantasia-2026-09";
const MEMBERS_ONLY_UNTIL = new Date("2026-09-01T00:00:00+02:00");
const FOUNDER_CAP = 20;

// Debe coincidir con LEGAL.CONDICIONES_VERSION en js/legal-config.js y con
// la misma constante en create-checkout-session.js.
const CONDICIONES_VERSION = "2026-08-v1";

// 3 de enero de 2027, 00:00 hora de Madrid (CET = UTC+1 en enero) = 2027-01-02T23:00:00Z.
// Debe coincidir con create-checkout-session.js.
const TRIAL_END_TIMESTAMP = Math.floor(Date.parse("2027-01-02T23:00:00Z") / 1000);

// La sala tiene 16 plazas (ROOM_CAP). "amigxs" vende 2 plazas por compra
// (42€, dos entradas juntas) — el tope real, además del propio de cada
// tier, es que entre todos los tiers no se superen las 16 plazas de la sala.
const ROOM_CAP = 16;
const TIERS = {
  early: { price: "price_1U3d6yCYD2PjyybiCY6yxF0l", cap: 4, seats: 1 },
  general: { price: "price_1U3d6zCYD2Pjyybiz6N4KB4B", cap: 12, seats: 1 },
  amigxs: { price: "price_1UGcXVCYD2Pjyybiwi8zI9sF", cap: 8, seats: 2 },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REQUIRED_FOUNDER_FIELDS = [
  "nombre",
  "apellido",
  "telefono",
  "ciudad",
  "que_te_trae",
  "expectativa",
  "como_te_entero",
];

async function existsActive(table, email, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?select=id&status=eq.active&email=eq.${encodeURIComponent(email)}`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  if (!res.ok) return false;
  const rows = await res.json();
  return rows.length > 0;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Método no permitido" }) };
  }

  const { STRIPE_SECRET_KEY, STRIPE_FOUNDER_PRICE_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } =
    process.env;

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Body inválido" }) };
  }

  const tier = body.tier;
  const config = TIERS[tier];
  if (!config) {
    return { statusCode: 400, body: JSON.stringify({ error: "Tier inválido" }) };
  }

  let email = null;
  if (new Date() < MEMBERS_ONLY_UNTIL) {
    email = (body.email || "").trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      return { statusCode: 400, body: JSON.stringify({ error: "Email inválido" }) };
    }
    const [isFounder, isMember] = await Promise.all([
      existsActive("founders", email, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
      existsActive("members", email, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
    ]);
    if (!isFounder && !isMember) {
      return { statusCode: 403, body: JSON.stringify({ error: "solo_socias" }) };
    }
  }

  // ¿Quiere sumarse como fundadora de paso? Solo tiene sentido si todavía no
  // es socia — si ya lo es, se ignora el flag y sigue como compra normal.
  let hacerseFundadora = Boolean(body.hacerse_fundadora);
  if (hacerseFundadora) {
    const emailFundadora = (body.email || "").trim().toLowerCase();
    if (!emailFundadora || !EMAIL_RE.test(emailFundadora)) {
      return { statusCode: 400, body: JSON.stringify({ error: "Email inválido" }) };
    }
    if (REQUIRED_FOUNDER_FIELDS.some((field) => !body[field])) {
      return { statusCode: 400, body: JSON.stringify({ error: "Faltan campos obligatorios" }) };
    }
    if (!body.acepta_condiciones || !body.acepta_privacidad || !body.acepta_codigo_conducta) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Hay que aceptar las condiciones, la privacidad y el código de conducta",
        }),
      };
    }

    const [yaFundadora, yaMiembro] = await Promise.all([
      existsActive("founders", emailFundadora, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
      existsActive("members", emailFundadora, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
    ]);
    if (yaFundadora || yaMiembro) {
      hacerseFundadora = false; // ya es socia, no hace falta crear nada nuevo
    } else {
      const countRes = await fetch(
        `${SUPABASE_URL}/rest/v1/founders?select=id&status=eq.active`,
        {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        }
      );
      if (!countRes.ok) {
        return { statusCode: 500, body: JSON.stringify({ error: "No se pudo consultar el cupo de fundadoras" }) };
      }
      const founders = await countRes.json();
      if (founders.length >= FOUNDER_CAP) {
        return { statusCode: 409, body: JSON.stringify({ error: "cupo_fundadoras_completo" }) };
      }
      email = emailFundadora;
    }
  }

  // Chequear cupo: cuántas entradas ya pagadas hay, de este tier y de todos
  // (para el tope real de la sala, contando 2 plazas por cada "amigxs").
  const countTicketsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/event_tickets?select=ticket_tier&event_id=eq.${EVENT_ID}&status=eq.paid`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  if (!countTicketsRes.ok) {
    return { statusCode: 500, body: JSON.stringify({ error: "No se pudo consultar el cupo" }) };
  }
  const allSold = await countTicketsRes.json();
  const soldPorTier = allSold.filter((t) => t.ticket_tier === tier).length;
  if (soldPorTier >= config.cap) {
    return { statusCode: 409, body: JSON.stringify({ error: "agotado" }) };
  }
  const plazasVendidas = allSold.reduce((sum, t) => sum + (TIERS[t.ticket_tier]?.seats || 1), 0);
  if (plazasVendidas + config.seats > ROOM_CAP) {
    return { statusCode: 409, body: JSON.stringify({ error: "agotado" }) };
  }

  // Si se suma como fundadora, guardar su aplicación antes de ir a pagar
  // (igual que create-checkout-session.js).
  if (hacerseFundadora) {
    await fetch(`${SUPABASE_URL}/rest/v1/founder_applications`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        nombre: body.nombre,
        apellido: body.apellido,
        telefono: body.telefono,
        edad: body.edad ? Number(body.edad) : null,
        ciudad: body.ciudad,
        barrio: body.barrio || null,
        que_te_trae: body.que_te_trae,
        expectativa: body.expectativa,
        compartir: body.compartir || null,
        como_te_entero: body.como_te_entero,
        acepta_condiciones: true,
        acepta_privacidad: true,
        acepta_codigo_conducta: true,
        condiciones_version: CONDICIONES_VERSION,
      }),
    });
  }

  const origin = event.headers.origin || "https://fraccctal.com";
  const params = new URLSearchParams({
    "line_items[0][price]": config.price,
    "line_items[0][quantity]": "1",
    "metadata[event_id]": EVENT_ID,
    "metadata[ticket_tier]": tier,
    success_url: `${origin}/encuentros/una-vida-de-fantasia?compra=ok`,
    cancel_url: `${origin}/encuentros/una-vida-de-fantasia?compra=cancelado`,
  });

  if (hacerseFundadora) {
    params.set("mode", "subscription");
    params.set("line_items[1][price]", STRIPE_FOUNDER_PRICE_ID);
    params.set("line_items[1][quantity]", "1");
    params.set("subscription_data[trial_end]", String(TRIAL_END_TIMESTAMP));
    params.set("metadata[tier]", "event_founder");
    params.set("customer_email", email);
  } else {
    params.set("mode", "payment");
    params.set("metadata[tier]", "event");
    const etiquetaTier = tier === "early" ? "early bird" : tier === "amigxs" ? "amigxs (2 entradas)" : "general";
    params.set("payment_intent_data[description]", `Una vida de fantasía — entrada ${etiquetaTier}`);
    if (email) {
      params.set("customer_email", email);
    }
  }

  const sessionRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const session = await sessionRes.json();
  if (!sessionRes.ok) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: session.error?.message || "Error de Stripe" }),
    };
  }

  return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
};
