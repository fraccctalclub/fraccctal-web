// Uso único: crea en Brevo una lista vacía "Asistentes · Una vida de
// fantasía (26 sep)" en la misma carpeta que la lista "Socixs del club",
// y la llena con los emails de quienes pagaron entrada a ese encuentro.
// Se borra apenas se corre una vez.

exports.handler = async () => {
  const { BREVO_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  const headers = { "api-key": BREVO_API_KEY, "Content-Type": "application/json" };

  // 1. Encontrar la carpeta de la lista "Socixs del club" (id 6)
  const existingListRes = await fetch("https://api.brevo.com/v3/contacts/lists/6", { headers });
  const existingList = await existingListRes.json();
  if (!existingListRes.ok) {
    return { statusCode: 500, body: JSON.stringify({ step: "get_folder", error: existingList }) };
  }
  const folderId = existingList.folderId;

  // 2. Crear la lista nueva en esa carpeta
  const createRes = await fetch("https://api.brevo.com/v3/contacts/lists", {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Asistentes · Una vida de fantasía (26 sep)", folderId }),
  });
  const created = await createRes.json();
  if (!createRes.ok) {
    return { statusCode: 500, body: JSON.stringify({ step: "create_list", error: created }) };
  }
  const listId = created.id;

  // 3. Traer los emails de quienes pagaron entrada a ese encuentro
  const ticketsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/event_tickets?select=email&event_id=eq.una-vida-de-fantasia-2026-09&status=eq.paid`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  const rows = await ticketsRes.json();
  const emails = [...new Set(rows.map((r) => r.email.toLowerCase()))];

  // 4. Subir cada email a la lista nueva
  for (const email of emails) {
    await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, listIds: [listId], updateEnabled: true }),
    });
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ listId, listName: created.name, folderId, sincronizados: emails.length, emails }),
  };
};
