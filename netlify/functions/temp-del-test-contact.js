exports.handler = async () => {
  const r = await fetch("https://api.brevo.com/v3/contacts/a%40b.co", {
    method: "DELETE", headers: { "api-key": process.env.BREVO_API_KEY },
  });
  return { statusCode: 200, body: JSON.stringify({ status: r.status }) };
};
