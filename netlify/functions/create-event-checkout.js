// Crea una Stripe Checkout Session para una entrada a un encuentro puntual.
// El catálogo de encuentros (cupo de sala, precios, fecha de preventa) vive
// en netlify/functions/lib/events.js — así se puede vender más de un
// encuentro a la vez sin que se pisen los cupos ni las Checkout Sessions.
//
// El encuentro se indica con body.event; sin ese campo cae en
// DEFAULT_EVENT_ID (compatibilidad con clientes viejos, ej. la página de
// septiembre cacheada en algún navegador). Se valida contra el catálogo
// antes que nada — nunca se construye una consulta a Supabase ni una sesión
// de Stripe con un id que venga del cliente sin validar.
//
// Durante la preventa (membersOnlyUntil del catálogo, por evento) la compra
// es exclusiva para socias (fundadora o miembro): hay que mandar el email
// verificado y se chequea contra Supabase acá mismo, server-side (no
// alcanza con que el frontend lo haya validado). Después se abre a
// cualquiera.
//
// Además, quien compra una entrada puede sumarse de paso como fundadora sin
// coste (body.hacerse_fundadora=true): en ese caso la Checkout Session pasa
// a mode:"subscription" con DOS line items — la entrada (pago único, se
// cobra ya) y el precio fundadora (recurrente, en trial hasta el 3 de enero
// de 2027, igual que en create-checkout-session.js). Stripe soporta mezclar
// un ítem de una sola vez dentro de una sesión de suscripción: se factura
// de inmediato aunque la suscripción esté en trial. El cupo de fundadoras
// (FOUNDER_CAP) es global: no depende del encuentro, así que no vive en el
// catálogo.
//
// Variables de entorno necesarias:
//   STRIPE_SECRET_KEY, STRIPE_FOUNDER_PRICE_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const { getEvent, DEFAULT_EVENT_ID, tiersReady } = require("./lib/events");

const FOUNDER_CAP = 20; // global: no depende del encuentro

// Debe coincidir con LEGAL.CONDICIONES_VERSION en js/legal-config.js y con
// la misma constante en create-checkout-session.js.
const CONDICIONES_VERSION = "2026-08-v1";

// 3 de enero de 2027, 00:00 hora de Madrid (CET = UTC+1 en enero) = 2027-01-02T23:00:00Z.
// Debe coincidir con create-checkout-session.js.
const TRIAL_END_TIMESTAMP = Math.floor(Date.parse("2027-01-02T23:00:00Z") / 1000);

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

  // Validar el encuentro contra el catálogo antes que nada.
  const eventId = body.event || DEFAULT_EVENT_ID;
  const eventConfig = getEvent(eventId);
  if (!eventConfig) {
    return { statusCode: 400, body: JSON.stringify({ error: "evento_desconocido" }) };
  }

  const tier = body.tier;
  const config = eventConfig.tiers[tier];
  if (!config) {
    return { statusCode: 400, body: JSON.stringify({ error: "Tier inválido" }) };
  }

  if (!tiersReady(eventConfig)) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Este encuentro todavía no tiene los precios de Stripe cargados" }),
    };
  }

  const membersOnlyUntil = new Date(eventConfig.membersOnlyUntil);

  let email = null;
  if (new Date() < membersOnlyUntil) {
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
        `${SUPABASE_URL}/rest/v1/founders?select=id&status=eq.active&counts_toward_cap=is.true`,
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

  // Chequear cupo: cuántas entradas ya pagadas hay de este encuentro, por
  // tier y en total (para el tope real de la sala, contando 2 plazas por
  // cada "amigxs").
  const countTicketsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/event_tickets?select=ticket_tier&event_id=eq.${eventId}&status=eq.paid`,
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
  const plazasVendidas = allSold.reduce((sum, t) => sum + (eventConfig.tiers[t.ticket_tier]?.seats || 1), 0);
  if (plazasVendidas + config.seats > eventConfig.roomCap) {
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
    "metadata[event_id]": eventId,
    "metadata[ticket_tier]": tier,
    success_url: `${origin}${eventConfig.slug}?compra=ok`,
    cancel_url: `${origin}${eventConfig.slug}?compra=cancelado`,
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
    params.set("payment_intent_data[description]", `${eventConfig.title} — entrada ${etiquetaTier}`);
    // Copiar la metadata al Payment Intent además de la Checkout Session:
    // así se ve de qué encuentro es cada cobro directo en el dashboard de
    // Stripe, sin tener que entrar a la sesión.
    params.set("payment_intent_data[metadata][event_id]", eventId);
    params.set("payment_intent_data[metadata][ticket_tier]", tier);
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
