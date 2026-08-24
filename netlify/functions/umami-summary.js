// Endpoint público de solo lectura para el resumen matutino: hace el fetch a
// la API de Umami Cloud del lado del servidor (la API key vive en variables
// de entorno, nunca en el navegador) y devuelve un JSON chico con lo que
// importa del día anterior — visitas, únicos, vistas a membresia.html y
// referrers principales.
//
// Si Umami no responde o falta la API key, devuelve { available: false } en
// vez de inventar números: quien consuma esto tiene que omitir las visitas
// en silencio ese día, no mostrar un cero falso.
//
// Variable de entorno necesaria: UMAMI_API_KEY (Umami Cloud → Settings → API Keys)

const UMAMI_WEBSITE_ID = "e087ac58-dba3-4486-9c45-344e54c3a58d";
const UMAMI_API_BASE = "https://api.umami.is/v1";

// Umami Cloud corre en UTC pero el club vive en hora de Madrid. Calculamos
// el rango [ayer 00:00, hoy 00:00) en hora de Madrid, convertido a epoch ms,
// para que "ayer" signifique lo mismo que le significa a Irina.
function madridOffsetMinutes(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value || "GMT+1";
  const match = tzName.match(/GMT([+-]\d+)/);
  return match ? parseInt(match[1], 10) * 60 : 60;
}

function yesterdayBoundsMadrid() {
  const now = new Date();
  const offsetMs = madridOffsetMinutes(now) * 60 * 1000;
  const nowMadrid = new Date(now.getTime() + offsetMs);
  const todayMidnightUTC = Date.UTC(
    nowMadrid.getUTCFullYear(),
    nowMadrid.getUTCMonth(),
    nowMadrid.getUTCDate()
  );
  const todayMidnightMadrid = todayMidnightUTC - offsetMs;
  return {
    startAt: todayMidnightMadrid - 24 * 60 * 60 * 1000,
    endAt: todayMidnightMadrid,
    dateLabel: new Date(todayMidnightMadrid - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
  };
}

async function umamiFetch(path, apiKey) {
  const res = await fetch(`${UMAMI_API_BASE}${path}`, {
    headers: { "x-umami-api-key": apiKey },
  });
  if (!res.ok) throw new Error(`Umami ${res.status}`);
  return res.json();
}

exports.handler = async () => {
  const { UMAMI_API_KEY } = process.env;

  if (!UMAMI_API_KEY) {
    return { statusCode: 200, body: JSON.stringify({ available: false }) };
  }

  const { startAt, endAt, dateLabel } = yesterdayBoundsMadrid();
  const qs = `startAt=${startAt}&endAt=${endAt}`;

  try {
    const [stats, urls, referrers] = await Promise.all([
      umamiFetch(`/websites/${UMAMI_WEBSITE_ID}/stats?${qs}`, UMAMI_API_KEY),
      umamiFetch(`/websites/${UMAMI_WEBSITE_ID}/metrics?type=url&${qs}`, UMAMI_API_KEY),
      umamiFetch(`/websites/${UMAMI_WEBSITE_ID}/metrics?type=referrer&${qs}`, UMAMI_API_KEY),
    ]);

    const membresiaViews = (urls || [])
      .filter((row) => (row.x || "").includes("membresia.html"))
      .reduce((sum, row) => sum + (row.y || 0), 0);

    const topReferrers = (referrers || [])
      .slice(0, 5)
      .map((row) => ({ referrer: row.x || "Directo", count: row.y || 0 }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        available: true,
        date: dateLabel,
        pageviews: stats?.pageviews?.value ?? 0,
        visitors: stats?.visitors?.value ?? 0,
        membresiaViews,
        topReferrers,
      }),
    };
  } catch {
    // Umami caído, key inválida, lo que sea: no inventamos nada.
    return { statusCode: 200, body: JSON.stringify({ available: false }) };
  }
};
