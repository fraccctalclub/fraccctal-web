// Uso único: manda el mail "esto es lo que significa ser fundadora" a las
// fundadoras activas de hoy (dadas de alta antes de que existieran estos
// beneficios nuevos). Se borra este archivo apenas se corre una vez.

const RESEND_FROM = "Fraccctal <hola@fraccctal.com>";
const NOTIFICACION_EMAIL = "fraccctal.contact@gmail.com";
const DFOS_LINK = "https://app.dfos.com/j/9crkn9827dc9kzzc22z9ha";
const WHATSAPP_LINK = "https://whatsapp.com/channel/0029Vb7tjMwGufIxndnWvc2J";

function emailHtml(nombre) {
  const saludo = nombre ? `Hola, ${nombre}:` : "Hola:";
  return `
    <p>${saludo}</p>
    <p>Queríamos contarte con más detalle qué significa ser fundadora, ahora que el club ya tiene más forma que cuando te sumaste.</p>
    <p>Antes que nada: si todavía no creaste tu cuenta en DFOS, este es el momento. Ahí es donde pasa todo: la conversación del círculo íntimo, los avisos, el contacto con el resto de fundadoras. Sin DFOS te estás perdiendo la mitad de lo que significa estar dentro.</p>
    <p>Ser fundadora significa esto.</p>
    <p>Lo primero: hasta el 31 de diciembre no pagas nada, y desde enero de 2027 tu cuota es de 11 € al mes (la mitad de la general) para siempre.</p>
    <p>Lo segundo: sois veinte y no habrá más. En enero se cierra el cupo y la palabra fundadora deja de estar disponible.</p>
    <p>Lo tercero: vas a estar ayudándonos a dar forma a este club. Contaremos con tu opinión, tu feedback, tus ideas y lo que quieras traer. En DFOS, nuestro espacio de encuentro online, vas a estar dentro del círculo íntimo. Si todavía no te uniste, es el paso que falta.</p>
    <p>Lo cuarto: tienes un 15% de descuento en tu primera sesión con nuestra terapeuta de cabecera, Yaneli García Ríos. Puedes reservar escribiendo a yaneli.psicoterapia@gmail.com.</p>
    <p>Lo quinto: la próxima vez que nos veamos te vamos a dar tu regalo de bienvenida, un merch solo para ti, en agradecimiento a tu apoyo.</p>
    <p>Y lo sexto: hasta que cerremos el club en enero, sois las únicas con acceso a la preventa de los talleres, con la posibilidad de comprar las entradas early bird antes que nadie.</p>
    <p>Dos pasos, por si todavía no los diste:</p>
    <p><strong><a href="${DFOS_LINK}">Crea tu cuenta en el DFOS</a></strong>, nuestro espacio de comunidad online (dos minutos).</p>
    <p><strong><a href="${WHATSAPP_LINK}">Súmate al canal de difusión de WhatsApp</a></strong>, ahí avisamos las novedades.</p>
    <p>Cualquier duda, responde a este mismo correo.</p>
    <p>Irina y Nat<br>Fraccctal</p>
  `;
}

const DESTINATARIAS = [
  { email: "nunezjulieta.r@gmail.com", nombre: "Julieta" },
  { email: "adamanegrete@gmail.com", nombre: "Ludgarda" },
  { email: "valentinapaez93@gmail.com", nombre: "Valentina" },
  { email: "damian.lucasdelavega@gmail.com", nombre: "Damian" },
  { email: "salem.carolina@gmail.com", nombre: "Carolina" },
  { email: "teresusca@hotmail.com", nombre: "Teresa" },
  { email: "gic.belenantonia@gmail.com", nombre: "Belén" },
  { email: "ana.aparicio.navarro@gmail.com", nombre: "Ana" },
];

exports.handler = async () => {
  const { RESEND_API_KEY } = process.env;
  if (!RESEND_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Falta RESEND_API_KEY" }) };
  }

  const enviados = [];
  for (const d of DESTINATARIAS) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        reply_to: NOTIFICACION_EMAIL,
        to: d.email,
        subject: "Esto es lo que significa ser fundadora de Fraccctal",
        html: emailHtml(d.nombre),
      }),
    });
    enviados.push({ email: d.email, ok: res.ok, status: res.status });
  }

  return { statusCode: 200, body: JSON.stringify({ enviados }) };
};
