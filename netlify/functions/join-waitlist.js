// Lista de espera de un encuentro agotado. Guarda a la persona en Supabase
// (tabla lista_espera, para respetar el orden de llegada) y en la lista de
// Brevo del encuentro (para poder escribirle si se libera una plaza).
//
// Para abrir lista de espera en otro encuentro: crear la lista en Brevo y
// añadir su id en WAITLIST_BREVO_LISTS.
//
// Variables de entorno: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const WAITLIST_BREVO_LISTS = {
  "la-erotica-del-buentrato-2026-10": 10,
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Método no permitido" }) };
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !BREVO_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "config" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Body inválido" }) };
  }

  const eventId = String(body.event || "");
  const email = String(body.email || "").trim().toLowerCase();
  const nombre = String(body.nombre || "").trim().slice(0, 100);

  if (!Object.prototype.hasOwnProperty.call(WAITLIST_BREVO_LISTS, eventId)) {
    return { statusCode: 400, body: JSON.stringify({ error: "evento_sin_lista" }) };
  }
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return { statusCode: 400, body: JSON.stringify({ error: "email_invalido" }) };
  }

  // 1) Supabase: el orden de llegada. Si ya estaba anotada (índice único),
  // lo tratamos como éxito sin pisar su posición.
  const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/lista_espera`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify({ event_id: eventId, email, nombre: nombre || null }),
  });
  if (!sbRes.ok) {
    console.error("lista_espera: Supabase respondió", sbRes.status);
    return { statusCode: 502, body: JSON.stringify({ error: "no_guardado" }) };
  }

  // 2) Brevo: para poder escribirle. Si falla, ya quedó guardada en Supabase,
  // así que no se lo mostramos como error a la persona.
  try {
    const attributes = nombre ? { NOMBRE: nombre } : undefined;
    const brevoRes = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        ...(attributes && { attributes }),
        listIds: [WAITLIST_BREVO_LISTS[eventId]],
        updateEnabled: true,
      }),
    });
    if (!brevoRes.ok && brevoRes.status !== 204) {
      console.error("lista_espera: Brevo respondió", brevoRes.status);
    }
  } catch (err) {
    console.error("lista_espera: Brevo falló", err.message);
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
