// Recibe la confirmación de pago de Stripe (checkout.session.completed), tanto
// de fundadoras como de miembros generales (se distingue por session.metadata.tier,
// seteado en create-checkout-session.js / create-membership-session.js). Guarda
// a la persona en Supabase, le manda su magic link de acceso de respaldo (el
// acceso principal ya lo dio founder-auto-login.js / member-auto-login.js), el
// email de bienvenida con la carta correspondiente y los links a la comunidad, y
// una notificación interna a NOTIFICACION_EMAIL con los datos de la aplicación.
//
// Configurar en el dashboard de Stripe (modo test primero): Developers → Webhooks →
// Add endpoint → https://fraccctal.com/.netlify/functions/stripe-webhook
// evento a escuchar: checkout.session.completed
//
// Variables de entorno necesarias:
//   STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY

const crypto = require("crypto");

const WHATSAPP_LINK = "https://chat.whatsapp.com/L1smx4zOpzUEgVl2fWbKRD";
const DFOS_LINK = "https://app.dfos.com/j/9crkn9827dc9kzzc22z9ha";
const NOTIFICACION_EMAIL = "fraccctal.contact@gmail.com";

// Carta de bienvenida de las fundadoras. El saludo con el nombre se arma aparte
// en sendWelcomeEmail, tomando el nombre guardado en founder_applications.
const CARTA_FUNDADORAS = `
  <p>Somos Irina y Nat. Te escribimos porque acabas de convertirte en una de las veinte fundadoras de Fraccctal, y eso no queríamos resolverlo con un correo automático.</p>
  <p>Hasta hace nada Fraccctal éramos dos personas hablando de lo que echábamos en falta en Madrid: un sitio al que ir sin tener que llegar con respuestas. Sin gurú, sin promesas de transformación, sin networking disfrazado de otra cosa. Lo que hay hoy: los encuentros, la gente, esta lista; existe porque unas cuantas dijisteis que sí cuando todavía no había nada que enseñar. Eso no se nos olvida y no se nos va a olvidar.</p>
  <p>Ser fundadora significa dos cosas concretas.</p>
  <p>La primera: hasta el 31 de diciembre no pagas nada, y desde enero de 2027 tu cuota es de 11 € al mes (la mitad de la general) para siempre. Te lo contamos ahora, con cinco meses de antelación, porque no queremos que en enero te llegue ninguna sorpresa.</p>
  <p>La segunda: sois veinte y no habrá más. En enero se cierra el cupo y la palabra fundadora deja de estar disponible.</p>
  <p>Y te pedimos algo a cambio, porque esto lo estamos construyendo con vosotras y no para vosotras: que nos digas qué funciona y qué no. Después de cada encuentro te va a llegar una encuesta corta. Contéstala siempre: queremos escucharte, sobre todo en lo que creas que podemos mejorar. Y cuando algo te parezca lo bastante bueno, tráete a alguien.</p>
  <p>Debajo te dejamos los primeros pasos.</p>
  <p>Nos vemos pronto, en persona.</p>
  <p>Irina y Nat<br>Fraccctal · club, comunidad, cambio</p>
`;

// EDITAR: carta de bienvenida para la membresía general (no fundadora).
// Reemplazar por el texto definitivo cuando lo tengan.
const CARTA_MIEMBROS = `
  <p>[PEGAR AQUÍ LA CARTA DE BIENVENIDA PARA MIEMBROS GENERALES]</p>
`;

// Contenido específico de cada encuentro para el email de confirmación de
// entrada (handleEventTicket, más abajo). Al publicar un encuentro nuevo,
// agregar acá sus datos — así el email nunca sale con el copy de otro
// taller pegado.
const EVENT_EMAIL_CONTENT = {
  "una-vida-de-fantasia-2026-09": {
    title: "Una vida de fantasía; o cómo avistar lo extraordinario en lo cotidiano",
    shortTitle: "Una vida de fantasía",
    facilitators: "Marta Argüelles",
    typeLabel: "Taller de escritura y juego",
    dateTimeLabel: "Sábado 26 de septiembre de 2026, de 11:00 a 14:00 h (abrimos la sala a las 10:45)",
    dayLabel: "26",
    venueLabel: "Rito · Lavapiés, Madrid (C. de Tribulete, 21, Centro, 28012 Madrid)",
    capacityWord: "dieciséis",
    queTraer:
      "Bolígrafo, lápiz o cualquier otro utensilio para escribir, y un cuaderno. También puedes traer tu ordenador, si prefieres escribir ahí. Y nada más: no hace falta ningún tipo de experiencia previa, ni haber escrito nunca, ni llegar inspirada, de eso se encargan las consignas. El foco está siempre en el proceso, nunca en el resultado. Nadie corrige nada, y nadie tiene que leer en voz alta si no le apetece.",
    pageUrl: "https://fraccctal.com/encuentros/una-vida-de-fantasia",
  },
  "la-erotica-del-buentrato-2026-10": {
    title: "La erótica del buentrato: Habitando nuevas narrativas",
    shortTitle: "La erótica del buentrato",
    facilitators: "Yaneli García Ríos",
    typeLabel: "Taller teórico-práctico sobre vínculos, límites y buentrato",
    dateTimeLabel: "Sábado 24 de octubre de 2026, de 17:00 a 20:00 h",
    dayLabel: "24",
    venueLabel: "Espacio en Blanco · Madrid (C. de Mira el Sol, 5, Centro, 28005 Madrid)",
    capacityWord: "dieciséis",
    queTraer:
      "Ropa cómoda que permita moverse, calcetines o pies descalzos, una botella de agua y un cuaderno o algo para apuntar. No hace falta ningún tipo de experiencia previa.",
    pageUrl: "https://fraccctal.com/encuentros/la-erotica-del-buentrato",
  },
};

function verifyStripeSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;

  const parts = {};
  for (const piece of signatureHeader.split(",")) {
    const [key, value] = piece.split("=");
    parts[key] = value;
  }
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const gotBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== gotBuf.length) return false;
  if (!crypto.timingSafeEqual(expectedBuf, gotBuf)) return false;

  // Rechazar eventos de más de 5 minutos, evita ataques de repetición.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  return age <= 300;
}

async function getApplication(email, table, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) {
  try {
    const appRes = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=*&email=eq.${encodeURIComponent(email)}&order=created_at.desc&limit=1`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    const rows = await appRes.json();
    return rows[0] || null;
  } catch {
    return null;
  }
}

async function sendEmail(RESEND_API_KEY, { to, subject, html }) {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Fraccctal <hola@fraccctal.com>",
      reply_to: NOTIFICACION_EMAIL,
      to,
      subject,
      html,
    }),
  });
}

async function sendWelcomeEmail(email, application, RESEND_API_KEY, tier) {
  if (!RESEND_API_KEY) return;

  const nombre = application?.nombre || "";
  const saludo = nombre ? `Hola, ${nombre}:` : "Hola:";
  const carta = tier === "member" ? CARTA_MIEMBROS : CARTA_FUNDADORAS;

  const html = `
    <p>${saludo}</p>
    ${carta}
    <p><strong><a href="${WHATSAPP_LINK}">Súmate al canal de difusión de WhatsApp</a></strong>, ahí vamos a avisar las novedades y fechas.</p>
    <p><strong><a href="${DFOS_LINK}">Crea tu cuenta en el DFOS</a></strong>, nuestro espacio de comunidad online. Ahí también podrás comunicarte con el resto de miembros de la comunidad: hay distintos canales de conversación según el tema.</p>
  `;

  await sendEmail(RESEND_API_KEY, { to: email, subject: "Bienvenida a Fraccctal", html });
}

async function sendInternalNotification(email, application, RESEND_API_KEY, tier) {
  if (!RESEND_API_KEY) return;

  const a = application || {};
  const etiqueta = tier === "member" ? "Nueva miembro general" : "Nueva fundadora";
  const html = `
    <p>${etiqueta}: <strong>${a.nombre || ""} ${a.apellido || ""}</strong></p>
    <ul>
      <li>Email: ${email}</li>
      <li>Teléfono: ${a.telefono || "-"}</li>
      <li>Edad: ${a.edad ?? "-"}</li>
      <li>Ciudad: ${a.ciudad || "-"} ${a.barrio ? `(${a.barrio})` : ""}</li>
      <li>Qué la trae: ${a.que_te_trae || "-"}</li>
      <li>Expectativa: ${a.expectativa || "-"}</li>
      <li>Quiere compartir: ${a.compartir || "-"}</li>
      <li>Cómo se enteró: ${a.como_te_entero || "-"}</li>
    </ul>
  `;

  await sendEmail(RESEND_API_KEY, {
    to: NOTIFICACION_EMAIL,
    subject: `${etiqueta}: ${a.nombre || email}`,
    html,
  });
}

// Entrada a un encuentro puntual (taller, etc.) — no crea cuenta ni socia,
// solo confirma el pago, suma la fila en event_tickets (para el cupo) y
// manda la confirmación por email.
async function handleEventTicket(session, email, { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY }) {
  const eventId = session.metadata?.event_id || "";
  const ticketTier = session.metadata?.ticket_tier || "";
  if (!email || !eventId || !ticketTier) return;

  await fetch(`${SUPABASE_URL}/rest/v1/event_tickets`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates",
    },
    body: JSON.stringify({
      event_id: eventId,
      ticket_tier: ticketTier,
      email,
      stripe_session_id: session.id,
      status: "paid",
    }),
  });

  const contenido = EVENT_EMAIL_CONTENT[eventId];
  if (!contenido) {
    // Encuentro sin copy de email cargado todavía: no inventamos texto —
    // avisamos internamente para completarlo a mano en vez de mandar algo
    // con los datos de otro taller.
    await sendEmail(RESEND_API_KEY, {
      to: NOTIFICACION_EMAIL,
      subject: `Falta el copy de email para ${eventId}`,
      html: `<p>Se vendió una entrada de <strong>${eventId}</strong> (${email}) pero no hay contenido cargado en EVENT_EMAIL_CONTENT (stripe-webhook.js). Avisale a la persona a mano.</p>`,
    });
    return;
  }

  const esAmigxs = ticketTier === "amigxs";
  const precio = ticketTier === "early" ? "20€ (early bird)" : esAmigxs ? "42€ (amigxs, 2 entradas)" : "25€";
  const plazaTexto = esAmigxs ? "tus dos plazas" : "tu plaza";

  // Si ya se hizo fundadorx en esta misma compra, no le repetimos el pitch
  // de la membresía acá — ya le llega su propia carta de bienvenida.
  const esCombo = session.metadata?.tier === "event_founder";
  const bloqueMembresia = esCombo
    ? ""
    : `
    <p><strong>¿Y si te haces socixs?</strong></p>
    <p>Ser socixs de Fraccctal implica esto: acceso a todos los talleres y encuentros (ya no los abrimos fuera de la comunidad), descuentos con nuestra red de terapeutas y talleristas, un merch de bienvenida, y tu lugar en la comunidad online donde la conversación sigue cada día. Y hoy <strong>ES GRATIS</strong>: no se cobra nada hasta el 3 de enero de 2027.</p>
    <p><strong><a href="https://fraccctal.com/membresia.html">Conoce la membresía →</a></strong></p>
  `;

  const html = `
    <p>¡Hola!</p>
    <p>Ya está: ${plazaTexto} para <strong>${contenido.title}</strong> ${esAmigxs ? "están reservadas" : "está reservada"}. Somos ${contenido.capacityWord}, y ${esAmigxs ? "sois dos de ellas" : "tú eres una de ellas"}.</p>
    <p>Gracias por venir. Fraccctal es un club muy joven (nació en Madrid este año) y cada entrada que se vende es lo que nos permite seguir programando. No lo decimos por cortesía: lo decimos porque es literal.</p>

    <p><strong>Los datos</strong></p>
    <ul>
      <li><strong>${contenido.title}.</strong> ${contenido.typeLabel} con ${contenido.facilitators}.</li>
      <li>${contenido.dateTimeLabel}.</li>
      <li>${contenido.venueLabel}.</li>
      <li>${esAmigxs ? "Tus entradas" : "Tu entrada"}: ${precio}</li>
    </ul>

    <p><strong>Qué traer</strong></p>
    <p>${contenido.queTraer}</p>

    <p><strong>Súmate a nuestra comunidad digital</strong></p>
    <p>Todo lo que tiene que ver con tu entrada pasa por ahí, no por email: actualizaciones del encuentro, y la posibilidad de conocer al resto de asistentes antes del taller si te apetece. Llegar con algunas caras ya vistas cambia bastante la experiencia. Es también el lugar donde seguimos encontrándonos y compartiendo reflexiones después de cada taller, y donde vas a tener acceso anticipado a los próximos encuentros, antes de que se abran al público.</p>
    <p><strong><a href="${DFOS_LINK}">Súmate al DFOS</a></strong>, el espacio digital de encuentro de la comunidad donde estamos todxs conectadxs (toma dos minutos), y <strong><a href="${WHATSAPP_LINK}">al canal de difusión de WhatsApp</a></strong>, donde avisamos las novedades.</p>
    ${bloqueMembresia}
    <p><strong>Si necesitas cancelar</strong></p>
    <p>Las entradas no tienen devolución. Si no puedes venir, escríbenos a fraccctal.contact@gmail.com y vemos cómo resolverlo entre todas.</p>

    <p>Somos ${contenido.capacityWord} y las plazas se llenan por el boca a boca. Si se te ocurre alguien a quien esto le vendría bien, reenvíale este correo o pásale el enlace: ${contenido.pageUrl}</p>

    <p>Cualquier duda, responde a este mismo correo y te contestamos nosotras directamente. Somos dos personas, no un buzón automático.</p>

    <p>Nos vemos el ${contenido.dayLabel}.</p>
    <p>Irina y Nat<br>Fraccctal</p>

    <p style="color:#57554a; font-size:0.9rem; margin-top:24px">Fraccctal es un club nacido en Madrid en 2026. Creamos espacios para personas en tránsito (las que tienen la vida más o menos en orden pero sienten que algo no encaja). Cuatro pilares: placer, movimiento, conocimiento y curiosidad espiritual.</p>
  `;
  await sendEmail(RESEND_API_KEY, { to: email, subject: `Tu plaza · ${contenido.shortTitle}`, html });

  await sendEmail(RESEND_API_KEY, {
    to: NOTIFICACION_EMAIL,
    subject: `Nueva entrada (${ticketTier}): ${email}`,
    html: `<p>Nueva entrada vendida para ${eventId}.</p><ul><li>Tier: ${ticketTier}</li><li>Email: ${email}</li><li>Sesión: ${session.id}</li></ul>`,
  });
}

// Alta de socia (fundadora o miembro general): guarda la fila en Supabase,
// dispara el magic link de respaldo, y manda el email de bienvenida + la
// notificación interna. Compartido entre el alta "sola" (metadata.tier ===
// "founder"/"member") y la combinada con entrada a un encuentro
// (metadata.tier === "event_founder").
async function handleMembershipAccount(session, email, tier, { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY }) {
  if (!email) return;

  const accountTable = tier === "member" ? "members" : "founders";
  const applicationTable = tier === "member" ? "member_applications" : "founder_applications";

  // Guardar (o actualizar) la fila de la persona. Requiere que la columna
  // "email" tenga una restricción UNIQUE en Supabase para que el upsert funcione.
  await fetch(`${SUPABASE_URL}/rest/v1/${accountTable}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      email,
      stripe_customer_id: session.customer,
      stripe_subscription_id: session.subscription,
      status: "active",
    }),
  });

  // Disparar un magic link de respaldo (por si vuelve otro día desde otro
  // dispositivo). El primer acceso normalmente ya lo dio founder-auto-login.js /
  // member-auto-login.js directo desde el pago, sin pasar por el email.
  const redirectTo = encodeURIComponent("https://fraccctal.com/preventa.html");
  await fetch(`${SUPABASE_URL}/auth/v1/otp?redirect_to=${redirectTo}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, create_user: true }),
  });

  const application = await getApplication(email, applicationTable, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  await sendWelcomeEmail(email, application, RESEND_API_KEY, tier);
  await sendInternalNotification(email, application, RESEND_API_KEY, tier);
}

exports.handler = async (event) => {
  const { STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY } =
    process.env;

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;

  const signatureHeader = event.headers["stripe-signature"];
  if (!verifyStripeSignature(rawBody, signatureHeader, STRIPE_WEBHOOK_SECRET)) {
    return { statusCode: 400, body: "Firma inválida" };
  }

  const stripeEvent = JSON.parse(rawBody);

  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object;
    const email = session.customer_email || (session.customer_details && session.customer_details.email);
    const deps = { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY };

    if (session.metadata?.tier === "event") {
      await handleEventTicket(session, email, deps);
      return { statusCode: 200, body: "ok" };
    }

    if (session.metadata?.tier === "event_founder") {
      // Compró entrada Y se sumó como fundadora en la misma Checkout Session
      // (mode:"subscription" con la entrada como line item de una sola vez).
      // Se procesan las dos altas: la entrada al encuentro y la cuenta de
      // fundadora, cada una con su propio email de confirmación.
      await handleEventTicket(session, email, deps);
      await handleMembershipAccount(session, email, "founder", deps);
      return { statusCode: 200, body: "ok" };
    }

    const tier = session.metadata?.tier === "member" ? "member" : "founder";
    await handleMembershipAccount(session, email, tier, deps);
  }

  return { statusCode: 200, body: "ok" };
};
