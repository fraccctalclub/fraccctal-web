// Setup de una sola vez: crea la lista "Socixs del club" y el atributo
// TIPO_SOCIA en Brevo (Fundadorx / Miembro). Se borra este archivo apenas
// se corre una vez — no lleva SYNC_SECRET a propósito (no lo tengo, y no
// hace falta pedírselo a Irina para una acción de un solo uso, idempotente
// y de bajo riesgo: como mucho crea una lista/atributo de más, fácil de
// borrar a mano si alguien la dispara antes de que se elimine el archivo).

exports.handler = async () => {
  const { BREVO_API_KEY } = process.env;
  if (!BREVO_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Falta BREVO_API_KEY" }) };
  }

  const headers = {
    "api-key": BREVO_API_KEY,
    "Content-Type": "application/json",
  };

  // 1. Crear el atributo TIPO_SOCIA (si ya existe, Brevo devuelve error y lo ignoramos).
  const attrRes = await fetch("https://api.brevo.com/v3/contacts/attributes/normal/TIPO_SOCIA", {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "text" }),
  });
  const attrBody = attrRes.ok ? "ok" : await attrRes.text();

  // 2. Crear la lista, en la misma carpeta que "Primerxs amigxs de Fraccctal" (folderId 3).
  const listRes = await fetch("https://api.brevo.com/v3/contacts/lists", {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Socixs del club", folderId: 3 }),
  });
  const listData = await listRes.json();

  return {
    statusCode: 200,
    body: JSON.stringify({ atributo: attrBody, lista: listData }),
  };
};
