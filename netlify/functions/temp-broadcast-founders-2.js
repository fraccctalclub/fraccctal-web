// Uso único: mail corto de seguimiento a las 8 fundadoras, con el párrafo
// cálido que se quedó afuera del mail anterior. Se borra apenas se corre.

const RESEND_FROM = "Fraccctal <hola@fraccctal.com>";
const NOTIFICACION_EMAIL = "fraccctal.contact@gmail.com";

function emailHtml(nombre) {
  const saludo = nombre ? `Hola, ${nombre}:` : "Hola:";
  return `
    <p>${saludo}</p>
    <p>Se nos quedó algo afuera del mail anterior, y no queríamos dejarlo sin decir.</p>
    <p>Queridas fundadoras: ya somos ocho, y no podemos estar más felices. Esto que una vez imaginamos se está haciendo tangible gracias a vosotras.</p>
    <p>Gracias por estar. Nos vemos pronto.</p>
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
        subject: "Una cosa que se nos quedó afuera",
        html: emailHtml(d.nombre),
      }),
    });
    enviados.push({ email: d.email, ok: res.ok, status: res.status });
  }

  return { statusCode: 200, body: JSON.stringify({ enviados }) };
};
