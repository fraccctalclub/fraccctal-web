// Sube a una lista de Brevo los emails de quienes pagaron su entrada a un
// encuentro puntual (hoy esos compradores no están sincronizados a Brevo en
// ningún lado, solo viven en la tabla event_tickets de Supabase). Pensado
// para prepararte la lista de destinatarios de la encuesta post-encuentro:
// crea la lista vacía en Brevo primero (con el nombre que quieras), pegá su
// ID acá, y esta función te llena esa lista con quienes efectivamente
// pagaron y asistieron a comprar entrada a ese encuentro.

function brevoHeaders(BREVO_API_KEY) {
  return { "api-key": BREVO_API_KEY, "Content-Type": "application/json" };
}

async function getPaidAttendees(eventId, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/event_tickets?select=email&event_id=eq.${encodeURIComponent(eventId)}&status=eq.paid`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  if (!res.ok) throw new Error(`Error leyendo event_tickets: ${res.status}`);
  const rows = await res.json();
  const emails = new Set(rows.map((r) => r.email.toLowerCase()));
  return [...emails];
}

async function upsertContactoEnLista(email, listId, BREVO_API_KEY) {
  await fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: brevoHeaders(BREVO_API_KEY),
    body: JSON.stringify({ email, listIds: [Number(listId)], updateEnabled: true }),
  });
}

async function runEventAttendeesSync({ eventId, listId, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY }) {
  if (!eventId || !listId) throw new Error("Faltan eventId o listId");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !BREVO_API_KEY) {
    throw new Error("Faltan variables de entorno (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / BREVO_API_KEY)");
  }

  const emails = await getPaidAttendees(eventId, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  for (const email of emails) {
    await upsertContactoEnLista(email, listId, BREVO_API_KEY);
  }

  return { evento: eventId, lista: listId, sincronizados: emails.length, emails };
}

module.exports = { runEventAttendeesSync };
