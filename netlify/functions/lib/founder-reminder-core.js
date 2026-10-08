// Recordatorio automático para quien empezó el alta de fundadora
// (founder_applications) pero el pago nunca se completó (no llegó a
// aparecer en founders con status active). Se manda una sola vez, al día
// siguiente de la aplicación: se buscan las aplicaciones de entre 24 y 48
// horas de antigüedad, así cada persona cae en esa ventana una sola vez sin
// necesitar una columna de "ya se le mandó" en la base.
//
// Variables de entorno necesarias:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY

const { sendEmail } = require("./send-email");

function reminderHtml(nombre) {
  const saludo = nombre ? `Hola, ${nombre}:` : "Hola:";
  return `
    <p>${saludo}</p>
    <p>Vimos que empezaste el alta como fundadora de Fraccctal hace unos días, pero el pago no llegó a completarse (a veces pasa: se cierra la pestaña, falla la conexión, cualquier cosa).</p>
    <p>Este es un momento clave para sumarte: solo hay 20 lugares de fundadora en total, y no va a haber más. Quien entra ahora no solo se ahorra la cuota hasta enero, también va a participar en las decisiones sobre el club y a construirlo junto a nosotras.</p>
    <p>Tu lugar todavía está disponible, y te recordamos qué implica: no se cobra nada hasta el 3 de enero de 2027, y antes de esa fecha te vamos a volver a escribir para avisarte que empieza a correr el cobro. Desde entonces, la cuota de fundadora es de 11€/mes, para siempre.</p>
    <p>Ser fundadora también te da acceso anticipado a la preventa de los talleres (entras antes que el público general) y al club de lectura y al walking club, sin coste aparte. Y a partir de enero, los talleres van a ser exclusivos para socias: ya no los vamos a abrir por fuera de la comunidad.</p>
    <p>Si quieres retomar tu alta, puedes hacerlo aquí: <a href="https://fraccctal.com/membresia.html">https://fraccctal.com/membresia.html</a></p>
    <p>Cualquier duda, responde a este mismo correo.</p>
    <p>Irina y Nat<br>Fraccctal</p>
  `;
}

async function runFounderReminder(env) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY } = env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY) {
    throw new Error("Faltan variables de entorno (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / RESEND_API_KEY)");
  }

  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };

  const now = Date.now();
  const desde = new Date(now - 48 * 60 * 60 * 1000).toISOString();
  const hasta = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  const appsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/founder_applications?select=email,nombre,created_at&created_at=gte.${desde}&created_at=lt.${hasta}&order=created_at.asc`,
    { headers }
  );
  if (!appsRes.ok) throw new Error(`Error leyendo founder_applications: ${appsRes.status}`);
  const apps = await appsRes.json();

  // Quien tiene fila de fundadora en CUALQUIER estado (activa o dada de baja)
  // ya completó el pago alguna vez: no se le recuerda que lo complete. Se
  // compara sin distinguir mayúsculas. Si no se puede consultar, mejor no
  // mandar nada que escribirle a quien ya pagó o se dio de baja.
  const foundersRes = await fetch(`${SUPABASE_URL}/rest/v1/founders?select=email`, { headers });
  if (!foundersRes.ok) throw new Error(`Error leyendo founders: ${foundersRes.status}`);
  const activas = new Set((await foundersRes.json()).map((f) => f.email.trim().toLowerCase()));

  let enviados = 0;
  const emailsEnviados = [];
  const yaTratadas = new Set();
  for (const app of apps) {
    const clave = app.email.trim().toLowerCase();
    if (activas.has(clave)) continue; // completó el pago, no hace falta recordatorio
    if (yaTratadas.has(clave)) continue; // varias solicitudes del mismo email: un solo recordatorio
    yaTratadas.add(clave);

    const r = await sendEmail(RESEND_API_KEY, {
      kind: "recordatorio_fundadora",
      to: app.email,
      subject: "Tu lugar como fundadora sigue esperándote",
      html: reminderHtml(app.nombre),
    });
    if (r.ok) {
      enviados++;
      emailsEnviados.push(app.email);
    }
  }

  return { revisadas: apps.length, recordatorios_enviados: enviados, emails: emailsEnviados };
}

module.exports = { runFounderReminder };
