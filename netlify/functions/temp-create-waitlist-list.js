exports.handler = async () => {
  const h = { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json" };
  const res = await fetch("https://api.brevo.com/v3/contacts/lists", {
    method: "POST", headers: h,
    body: JSON.stringify({ name: "Lista de espera · La erótica del buentrato", folderId: 3 }),
  });
  return { statusCode: 200, body: JSON.stringify({ status: res.status, body: await res.json() }) };
};
