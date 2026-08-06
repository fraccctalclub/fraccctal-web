// Revisa el feed RSS público del Substack de Fraccctal y replica cada carta
// nueva como una fila en la tabla `cartas` de Supabase, para que el sitio
// pueda mostrarlas en /cartas.html y /carta.html sin depender de Substack.
//
// Se ejecuta sola una vez por semana (ver [functions."sync-substack"] en
// netlify.toml), y también se puede disparar a mano pegando en el navegador
// (o con curl):
//   https://fraccctal.com/.netlify/functions/sync-substack?secret=TU_SYNC_SECRET
//
// Variables de entorno necesarias: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SYNC_SECRET

const FEED_URL = "https://fraccctal.substack.com/feed";

// Convierte entidades HTML (numéricas y las más comunes con nombre) a texto plano.
function decodeEntities(str) {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function extractTag(block, tag) {
  const cdata = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`).exec(block);
  if (cdata) return cdata[1];
  const plain = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block);
  return plain ? plain[1] : "";
}

function parseFeed(xml) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  return items.map((block) => {
    const title = decodeEntities(extractTag(block, "title").trim());
    const link = extractTag(block, "link").trim();
    const pubDate = extractTag(block, "pubDate").trim();
    let content = extractTag(block, "content:encoded");

    // Sacamos el botón de suscripción propio de Substack: ponemos el nuestro,
    // con nuestro estilo, al pie de carta.html.
    content = content.replace(/<p class="button-wrapper"[\s\S]*?<\/p>/g, "");

    const slug = (link.split("/p/")[1] || "").split("?")[0].replace(/\/$/, "");

    const plainText = decodeEntities(content.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    let excerpt = plainText.slice(0, 220);
    if (plainText.length > 220) {
      excerpt = excerpt.slice(0, excerpt.lastIndexOf(" ")) + "…";
    }

    return {
      substack_url: link,
      slug,
      title,
      excerpt,
      content_html: content.trim(),
      published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
    };
  }).filter((item) => item.slug && item.title);
}

exports.handler = async (event) => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SYNC_SECRET } = process.env;

  // Las invocaciones programadas por Netlify mandan {"next_run": "..."} en el
  // body; cualquier otra invocación (manual, por curl) necesita el secreto.
  let isScheduled = false;
  try {
    isScheduled = !!JSON.parse(event.body || "{}").next_run;
  } catch {
    isScheduled = false;
  }
  if (!isScheduled) {
    const secret = event.queryStringParameters?.secret;
    if (!SYNC_SECRET || secret !== SYNC_SECRET) {
      return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) };
    }
  }

  const feedRes = await fetch(FEED_URL);
  if (!feedRes.ok) {
    return { statusCode: 502, body: JSON.stringify({ error: "No se pudo leer el feed de Substack" }) };
  }
  const xml = await feedRes.text();
  const items = parseFeed(xml);

  const existingRes = await fetch(`${SUPABASE_URL}/rest/v1/cartas?select=slug`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  const existing = new Set((await existingRes.json()).map((r) => r.slug));

  const nuevas = items.filter((item) => !existing.has(item.slug));

  for (const item of nuevas.reverse()) {
    // reverse: insertamos de la más vieja a la más nueva, para que created_at quede en orden.
    await fetch(`${SUPABASE_URL}/rest/v1/cartas`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates",
      },
      body: JSON.stringify(item),
    });
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ revisadas: items.length, nuevas: nuevas.length, slugs: nuevas.map((i) => i.slug) }),
  };
};
