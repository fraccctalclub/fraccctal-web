// Dice si un email corresponde a una fundadora o miembro activa. La usan
// membresia.html/preventa.html tanto ANTES de mandar el magic link (para no
// crear una cuenta ni gastar un envío con alguien que no pagó) como DESPUÉS,
// al mostrar el contenido de preventa.html (para no confiar solo en "hay una
// sesión de Supabase válida" — cualquier email puede pedirse un magic link y
// loguearse, eso no significa que sea socia).
//
// No expone nada del listado: solo true/false para el email que se pregunta.
//
// Variables de entorno necesarias:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

  let email;
  try {
    ({ email } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Body inválido" }) };
  }
  if (!email || !EMAIL_RE.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Email inválido" }) };
  }

  const [isFounder, isMember] = await Promise.all([
    existsActive("founders", email, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
    existsActive("members", email, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
  ]);

  return {
    statusCode: 200,
    body: JSON.stringify({ isMember: isFounder || isMember, tier: isFounder ? "founder" : isMember ? "member" : null }),
  };
};
