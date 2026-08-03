// Endpoint público de solo lectura: dice si todavía quedan lugares de
// fundadora. Lo usa membresia.html para ocultar el botón de anotarse una vez
// que se llega al cupo (no expone datos personales, solo un conteo).
//
// Variables de entorno necesarias:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const FOUNDER_CAP = 20;

exports.handler = async () => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

  const countRes = await fetch(
    `${SUPABASE_URL}/rest/v1/founders?select=id&status=eq.active`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );

  if (!countRes.ok) {
    return { statusCode: 200, body: JSON.stringify({ capReached: false }) };
  }

  const founders = await countRes.json();
  return {
    statusCode: 200,
    body: JSON.stringify({ capReached: founders.length >= FOUNDER_CAP }),
  };
};
