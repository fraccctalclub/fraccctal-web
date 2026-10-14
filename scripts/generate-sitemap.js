// Regenera sitemap.xml: páginas fijas + fichas de encuentros (las que tienen
// página propia en js/events.js) + cartas publicadas (tabla `cartas`).
//
// Uso:  node scripts/generate-sitemap.js   y luego commit de sitemap.xml.
// lastmod de cada página sale de su último commit en git; el de las cartas,
// de su fecha de publicación.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SITE = "https://fraccctal.com";
const SUPABASE_URL = "https://hvxjahxcbnaumnfsnywf.supabase.co";
const SUPABASE_ANON_KEY = fs
  .readFileSync(path.join(ROOT, "js/cartas.js"), "utf8")
  .match(/SUPABASE_ANON_KEY =\s*"([^"]+)"/)[1];

const PAGINAS = [
  { url: "/", file: "index.html", priority: "1.0" },
  { url: "/encuentros.html", file: "encuentros.html", priority: "0.9" },
  { url: "/membresia.html", file: "membresia.html", priority: "0.8" },
  { url: "/quienes-somos.html", file: "quienes-somos.html", priority: "0.7" },
  { url: "/cartas.html", file: "cartas.html", priority: "0.6" },
];

// Cada ficha de encuentro vive en un archivo distinto del que sale su URL
// bonita (ver redirects en netlify.toml).
const FICHAS = {
  "/encuentros/una-vida-de-fantasia": "encuentro-una-vida-de-fantasia.html",
  "/encuentros/la-erotica-del-buentrato": "encuentro-la-erotica-del-buentrato.html",
  "/encuentros/lo-que-el-hambre-sabe": "encuentro-lo-que-el-hambre-sabe.html",
};

function lastmod(file) {
  return execSync(`git log -1 --format=%cs -- ${file}`, { cwd: ROOT }).toString().trim();
}

function eventos() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/events.js"), "utf8") + "\nthis.E = FRACCCTAL_EVENTS;", ctx);
  return ctx.E;
}

async function cartas() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/cartas?select=slug,title,published_at&order=published_at.desc`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`No se pudieron leer las cartas: ${res.status}`);
  return res.json();
}

(async () => {
  const urls = PAGINAS.map((p) => ({ loc: p.url, priority: p.priority, lastmod: lastmod(p.file) }));

  for (const e of eventos()) {
    const ficha = e.detailUrl || (String(e.ticketsUrl).startsWith("/encuentros/") ? e.ticketsUrl : "");
    if (!ficha) continue;
    if (!FICHAS[ficha]) throw new Error(`Falta ${ficha} en FICHAS`);
    // Los encuentros abiertos pesan más; los pasados quedan como archivo.
    urls.push({ loc: ficha, priority: e.status === "cerrado" ? "0.5" : "0.9", lastmod: lastmod(FICHAS[ficha]) });
  }

  // Hay cartas duplicadas en la tabla (mismo título, slug con sufijo): se deja
  // solo la más antigua para no publicar contenido repetido en el sitemap.
  const vistos = new Set();
  const unicas = (await cartas())
    .sort((a, b) => String(a.published_at).localeCompare(String(b.published_at)))
    .filter((c) => !vistos.has(c.title) && vistos.add(c.title));
  for (const c of unicas.reverse()) {
    urls.push({ loc: `/cartas/${c.slug}`, priority: "0.5", lastmod: String(c.published_at).slice(0, 10) });
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map((u) => `  <url>\n    <loc>${SITE}${u.loc}</loc>\n    <priority>${u.priority}</priority>\n    <lastmod>${u.lastmod}</lastmod>\n  </url>\n`)
      .join("") +
    `</urlset>\n`;
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), xml);
  console.log(`sitemap.xml: ${urls.length} URLs`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
