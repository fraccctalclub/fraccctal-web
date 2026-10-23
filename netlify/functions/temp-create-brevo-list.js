// Uso único (se borra tras correrla): crea la lista de Brevo de la lista de
// espera de "Lo que el hambre sabe", en la misma carpeta que las demás. Es
// idempotente: si la lista ya existe, devuelve su id sin crear otra.

const NOMBRE = "Lista de espera · Lo que el hambre sabe";

exports.handler = async () => {
  const { BREVO_API_KEY } = process.env;
  if (!BREVO_API_KEY) return { statusCode: 500, body: JSON.stringify({ error: "Falta BREVO_API_KEY" }) };
  const h = { "api-key": BREVO_API_KEY, "Content-Type": "application/json" };

  const lista = await fetch("https://api.brevo.com/v3/contacts/lists?limit=50", { headers: h });
  if (!lista.ok) return { statusCode: 500, body: JSON.stringify({ paso: "leer", status: lista.status }) };
  const existente = (await lista.json()).lists.find((l) => l.name === NOMBRE);
  if (existente) return { statusCode: 200, body: JSON.stringify({ id: existente.id, creada: false }) };

  const res = await fetch("https://api.brevo.com/v3/contacts/lists", {
    method: "POST",
    headers: h,
    body: JSON.stringify({ name: NOMBRE, folderId: 3 }),
  });
  const data = await res.json();
  if (!res.ok) return { statusCode: 500, body: JSON.stringify({ paso: "crear", status: res.status, data }) };
  return { statusCode: 200, body: JSON.stringify({ id: data.id, creada: true }) };
};
