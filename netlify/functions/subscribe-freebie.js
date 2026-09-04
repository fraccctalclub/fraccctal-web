// Recibe nombre/apellido/email desde la página escondida del freebie
// ("El poema de las cosas que (no) se repiten"), da de alta el contacto en
// Brevo dentro de la lista "vida de fantasía" (o lo actualiza si ya existe),
// y devuelve el link de descarga del PDF. El PDF no se entrega si Brevo
// falla: sin alta, no hay descarga.
//
// Variables de entorno necesarias (configurar en Netlify, nunca en el repo):
//   BREVO_API_KEY, BREVO_LIST_ID (el id numérico de la lista "vida de fantasía")

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PDF_URL = "/assets/freebies/el-poema-de-las-cosas.pdf";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Método no permitido" }) };
  }

  const { BREVO_API_KEY, BREVO_LIST_ID } = process.env;
  if (!BREVO_API_KEY || !BREVO_LIST_ID) {
    return { statusCode: 500, body: JSON.stringify({ error: "Brevo no está configurado todavía" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Body inválido" }) };
  }

  const { nombre, apellido, email, acepta_marketing } = body;

  if (!email || !EMAIL_RE.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Email inválido" }) };
  }
  if (!nombre || !apellido) {
    return { statusCode: 400, body: JSON.stringify({ error: "Faltan nombre o apellido" }) };
  }
  if (!acepta_marketing) {
    return { statusCode: 400, body: JSON.stringify({ error: "Hay que aceptar recibir emails para continuar" }) };
  }

  const brevoRes = await fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      attributes: { NOMBRE: nombre, APELLIDOS: apellido },
      listIds: [Number(BREVO_LIST_ID)],
      updateEnabled: true,
    }),
  });

  // Brevo devuelve 201 si es alta nueva y 204 si ya existía y se actualizó.
  if (!brevoRes.ok && brevoRes.status !== 204) {
    let detail = "";
    try {
      detail = (await brevoRes.json()).message || "";
    } catch {
      // sin body legible, seguimos con el mensaje genérico
    }
    return {
      statusCode: 502,
      body: JSON.stringify({ error: detail || "No pudimos anotarte, inténtalo de nuevo." }),
    };
  }

  return { statusCode: 200, body: JSON.stringify({ url: PDF_URL }) };
};
