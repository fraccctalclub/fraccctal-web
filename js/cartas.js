// Trae las cartas replicadas del Substack (tabla `cartas` en Supabase, de
// lectura pública) y las pinta en cartas.html (listado) y carta.html
// (detalle). Sin dependencias: fetch directo a la API REST de Supabase.

const SUPABASE_URL = "https://hvxjahxcbnaumnfsnywf.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2eGphaHhjYm5hdW1uZnNueXdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0OTc3MzksImV4cCI6MjEwMTA3MzczOX0.MnQNDGhr9ePdtOTn-bXaHZyvk3-AIvRcAOaAG69_ASc";

function supabaseHeaders() {
  return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
}

async function fetchCartas() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/cartas?select=slug,title,excerpt,published_at&order=published_at.desc`,
    { headers: supabaseHeaders() }
  );
  if (!res.ok) return [];
  return res.json();
}

async function fetchCarta(slug) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/cartas?select=*&slug=eq.${encodeURIComponent(slug)}`,
    { headers: supabaseHeaders() }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

function formatFecha(iso) {
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function getSlugFromUrl() {
  const params = new URLSearchParams(location.search);
  if (params.get("c")) return params.get("c");
  const match = location.pathname.match(/\/cartas\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function renderCartasList(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const cartas = await fetchCartas();
  if (!cartas.length) {
    el.innerHTML =
      '<p style="text-align:center">Todavía no hay cartas acá. Mientras tanto, ' +
      '<a href="https://fraccctal.substack.com" target="_blank" rel="noopener">suscribite en Substack</a> ' +
      'para no perderte ninguna.</p>';
    return;
  }
  el.innerHTML = cartas
    .map(
      (c) => `
    <a class="carta-card" href="/cartas/${encodeURIComponent(c.slug)}">
      <p class="carta-card__date">${formatFecha(c.published_at)}</p>
      <h3>${escapeHtml(c.title)}</h3>
      <p>${escapeHtml(c.excerpt)}</p>
    </a>`
    )
    .join("");
}

async function renderCartaDetail(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const slug = getSlugFromUrl();
  if (!slug) {
    el.innerHTML = '<p style="text-align:center">No encontramos esa carta. <a href="cartas.html">Ver todas las cartas →</a></p>';
    return;
  }
  const carta = await fetchCarta(slug);
  if (!carta) {
    el.innerHTML = '<p style="text-align:center">No encontramos esa carta. <a href="cartas.html">Ver todas las cartas →</a></p>';
    return;
  }

  document.title = `${carta.title} · Fraccctal`;
  const descMeta = document.querySelector('meta[name="description"]');
  if (descMeta) descMeta.setAttribute("content", carta.excerpt || carta.title);
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute("href", `https://fraccctal.com/cartas/${carta.slug}`);
  document.querySelectorAll('meta[property="og:title"], meta[name="twitter:title"]').forEach((m) =>
    m.setAttribute("content", `${carta.title} · Fraccctal`)
  );
  document.querySelectorAll('meta[property="og:description"], meta[name="twitter:description"]').forEach((m) =>
    m.setAttribute("content", carta.excerpt || carta.title)
  );
  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.setAttribute("content", `https://fraccctal.com/cartas/${carta.slug}`);

  el.innerHTML = `
    <p class="carta-detail__meta">${formatFecha(carta.published_at)}</p>
    <h1>${escapeHtml(carta.title)}</h1>
    <div class="carta-detail__body">${carta.content_html}</div>
    <div class="carta-nav">
      <a href="cartas.html">← Todas las cartas</a>
      <a href="https://fraccctal.substack.com" target="_blank" rel="noopener">Suscribirme en Substack →</a>
    </div>
  `;
}
