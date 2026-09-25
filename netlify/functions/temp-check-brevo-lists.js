// Uso único, solo lectura: lista las listas de Brevo que contienen
// "Asistentes" en el nombre, para ver qué se creó.
exports.handler = async () => {
  const { BREVO_API_KEY } = process.env;
  const res = await fetch("https://api.brevo.com/v3/contacts/lists?limit=50", {
    headers: { "api-key": BREVO_API_KEY },
  });
  const data = await res.json();
  if (!res.ok) return { statusCode: 500, body: JSON.stringify(data) };
  const matches = (data.lists || []).filter((l) => l.name.includes("Asistentes"));
  return { statusCode: 200, body: JSON.stringify(matches, null, 2) };
};
