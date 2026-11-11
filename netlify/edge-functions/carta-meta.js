// Edge Function: /cartas/:slug
//
// Todas las cartas comparten el mismo carta.html, y antes el título, la URL
// canónica y el texto solo aparecían cuando el navegador ejecutaba js/cartas.js.
// Para Google, mientras tanto, todas eran la misma página ("Duplicada: el
// usuario no ha indicado ninguna versión canónica").
//
// Aquí se rellena el HTML antes de entregarlo: título, descripción, canónica,
// etiquetas og/twitter y el texto de la carta. Si la carta no existe se
// responde 404 con la misma página. Si algo falla, se entrega carta.html tal
// cual (onError: "bypass") y js/cartas.js hace el resto como siempre.

const SUPABASE_URL = "https://hvxjahxcbnaumnfsnywf.supabase.co";
// Clave pública (anon) de solo lectura, la misma que usa js/cartas.js.
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2eGphaHhjYm5hdW1uZnNueXdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0OTc3MzksImV4cCI6MjEwMTA3MzczOX0.MnQNDGhr9ePdtOTn-bXaHZyvk3-AIvRcAOaAG69_ASc";

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatFecha(iso) {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Madrid",
  });
}

export default async (request, context) => {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/cartas\/([^/]+)\/?$/);
  if (!match) return;
  const slug = decodeURIComponent(match[1]);

  const [response, cartaRes] = await Promise.all([
    context.next(),
    fetch(`${SUPABASE_URL}/rest/v1/cartas?select=slug,title,excerpt,published_at,content_html&slug=eq.${encodeURIComponent(slug)}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    }),
  ]);

  const tipo = response.headers.get("content-type") || "";
  if (!tipo.includes("text/html") || !cartaRes.ok) return response;

  const carta = (await cartaRes.json())[0];
  let html = await response.text();
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("etag");

  // Carta inexistente: misma página, pero con 404 y sin indexar.
  if (!carta) {
    html = html.replace("</head>", '<meta name="robots" content="noindex">\n</head>');
    return new Response(html, { status: 404, headers });
  }

  const titulo = esc(`${carta.title} · Fraccctal`);
  const desc = esc(carta.excerpt || carta.title);
  const canonica = `https://fraccctal.com/cartas/${encodeURIComponent(carta.slug)}`;

  html = html
    .replace(/<title>[^<]*<\/title>/, `<title>${titulo}</title>\n<link rel="canonical" href="${canonica}">`)
    .replace(/(<meta name="description" content=")[^"]*(">)/, `$1${desc}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(">)/, `$1${canonica}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(">)/, `$1${titulo}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(">)/, `$1${desc}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(">)/, `$1${titulo}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(">)/, `$1${desc}$2`)
    .replace(
      /(<div id="carta-detail">)[\s\S]*?(<\/div>\s*<\/div>\s*<\/section>)/,
      // Función de reemplazo: el HTML de la carta puede llevar "$", que en una
      // cadena de reemplazo normal se interpretaría como referencia a un grupo.
      (_, abre, cierra) =>
        `${abre}
      <p class="carta-detail__meta">${formatFecha(carta.published_at)}</p>
      <h1>${esc(carta.title)}</h1>
      <div class="carta-detail__body">${carta.content_html || ""}</div>
    ${cierra}`
    );

  return new Response(html, { status: 200, headers });
};

export const config = { path: "/cartas/*", onError: "bypass" };
