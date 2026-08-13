// TEMPORAL — crea la configuración por defecto del Portal de Cliente de
// Stripe (permite cancelar la suscripción, ver historial de pagos, y
// actualizar el método de pago). Se ejecuta una sola vez. Borrar después.
//
// Uso: https://fraccctal.com/.netlify/functions/temp-setup-portal?secret=TU_SYNC_SECRET

exports.handler = async (event) => {
  const { STRIPE_SECRET_KEY, SYNC_SECRET } = process.env;
  const secret = event.queryStringParameters?.secret;
  if (!SYNC_SECRET || secret !== SYNC_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) };
  }

  const params = new URLSearchParams({
    "business_profile[headline]": "Fraccctal · club, comunidad, cambio",
    "features[subscription_cancel][enabled]": "true",
    "features[subscription_cancel][mode]": "at_period_end",
    "features[subscription_cancel][cancellation_reason][enabled]": "true",
    "features[payment_method_update][enabled]": "true",
    "features[invoice_history][enabled]": "true",
  });
  [
    "missing_features",
    "switched_service",
    "unused",
    "customer_service",
    "too_expensive",
    "other",
  ].forEach((reason, i) => {
    params.append(`features[subscription_cancel][cancellation_reason][options][${i}]`, reason);
  });

  const res = await fetch("https://api.stripe.com/v1/billing_portal/configurations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const data = await res.json();
  return { statusCode: res.ok ? 200 : 500, body: JSON.stringify(data) };
};
