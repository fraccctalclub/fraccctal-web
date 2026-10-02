exports.handler = async () => {
  const { BREVO_API_KEY } = process.env;
  const email = "moraporthe@gmail.com";
  const h = { "api-key": BREVO_API_KEY, "Content-Type": "application/json" };
  const put = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
    method: "PUT", headers: h, body: JSON.stringify({ attributes: { TIPO_SOCIA: "" } }),
  });
  const get = await (await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, { headers: h })).json();
  return { statusCode: 200, body: JSON.stringify({ put: put.status, attributes: get.attributes, listIds: get.listIds }) };
};
