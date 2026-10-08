exports.handler = async () => {
  const h = { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json" };
  const email = "damian.lucasdelavega@gmail.com";
  const rm = await fetch("https://api.brevo.com/v3/contacts/lists/6/contacts/remove", {
    method: "POST", headers: h, body: JSON.stringify({ emails: [email] }),
  });
  const put = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
    method: "PUT", headers: h, body: JSON.stringify({ attributes: { TIPO_SOCIA: "" } }),
  });
  const get = await (await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, { headers: h })).json();
  return { statusCode: 200, body: JSON.stringify({ remove: rm.status, put: put.status, listIds: get.listIds, tipo: get.attributes?.TIPO_SOCIA ?? null }) };
};
