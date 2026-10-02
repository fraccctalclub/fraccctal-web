// Recuento de los emails que ha intentado mandar la web (tabla email_log).
//
// Uso: https://fraccctal.com/.netlify/functions/email-log-summary?secret=TU_SYNC_SECRET
//      opcional: &days=7 (por defecto 30) y &to=correo@ejemplo.com (filtra por destinatario)

exports.handler = async (event) => {
  const { SYNC_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  const params = event.queryStringParameters || {};
  if (!SYNC_SECRET || params.secret !== SYNC_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) };
  }

  const days = Math.min(Number(params.days) || 30, 365);
  const desde = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  let url = `${SUPABASE_URL}/rest/v1/email_log?select=created_at,kind,to_email,subject,status,http_status,error&created_at=gte.${desde}&order=created_at.desc&limit=1000`;
  if (params.to) url += `&to_email=ilike.${encodeURIComponent(params.to)}`;

  const res = await fetch(url, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) return { statusCode: 500, body: JSON.stringify({ error: `Supabase ${res.status}` }) };
  const rows = await res.json();

  const porTipo = {};
  for (const r of rows) {
    porTipo[r.kind] = porTipo[r.kind] || { sent: 0, failed: 0 };
    porTipo[r.kind][r.status]++;
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dias: days, total: rows.length, por_tipo: porTipo, ultimos: rows.slice(0, 50) }, null, 2),
  };
};
