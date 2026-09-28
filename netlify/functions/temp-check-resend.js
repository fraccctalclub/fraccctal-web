// Uso único, solo lectura: busca en Resend los emails enviados a una
// dirección puntual, para verificar si salió el mail de bienvenida.
exports.handler = async (event) => {
  const { RESEND_API_KEY } = process.env;
  const target = (event.queryStringParameters?.to || "").toLowerCase();

  const res = await fetch("https://api.resend.com/emails", {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  });
  const data = await res.json();
  if (!res.ok) {
    return { statusCode: 500, body: JSON.stringify({ error: data }) };
  }

  const all = data.data || data;
  const matches = Array.isArray(all)
    ? all.filter((e) => JSON.stringify(e.to || "").toLowerCase().includes(target))
    : [];

  return {
    statusCode: 200,
    body: JSON.stringify({ raw_keys: Object.keys(data), total_returned: Array.isArray(all) ? all.length : null, matches }, null, 2),
  };
};
