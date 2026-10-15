// Regla de bajas: quien se da de baja a partir de BLOQUEO_DESDE no puede volver
// a darse de alta (ni, por tanto, apuntarse a encuentros, que son solo para
// socias) hasta que pasen BLOQUEO_MESES desde que terminó su membresía.
//
// - BLOQUEO_DESDE coincide con el envío del aviso de cobro del 30 de diciembre
//   (founder-billing-notice): las bajas anteriores no cuentan.
// - La fecha que cuenta es founders/members.canceled_at: cuándo terminó de verdad
//   la membresía (para quien ya pagaba, el final del período abonado).
// - Debe coincidir con js/legal-config.js (BAJA_BLOQUEO_*) y con condiciones.html.

const BLOQUEO_DESDE = new Date("2026-12-30T08:00:00Z");
const BLOQUEO_MESES = 2;

// Desde esta fecha los encuentros y talleres son solo para socias (3 de enero
// de 2027, 00:00 hora de Madrid).
const COMUNIDAD_CERRADA_DESDE = new Date("2027-01-02T23:00:00Z");

function sumarMeses(fecha, meses) {
  const d = new Date(fecha.getTime());
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d;
}

function finDelBloqueo(canceladaEn) {
  return sumarMeses(new Date(canceladaEn), BLOQUEO_MESES);
}

// "12 de marzo de 2027", en hora de Madrid.
function fechaLarga(fecha) {
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" }).format(fecha);
}

// ¿Este email está bloqueado ahora por una baja reciente? Devuelve
// { hasta: Date, hastaLabel: string } o null. Si no se puede consultar, no se
// bloquea (mejor dejar entrar que cerrar la puerta por un fallo nuestro).
async function bloqueoPorBaja(email, { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY }, ahora = new Date()) {
  const clave = (email || "").trim().toLowerCase();
  if (!clave || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };

  let ultima = null;
  try {
    for (const tabla of ["founders", "members"]) {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/${tabla}?select=email,canceled_at&status=eq.canceled&canceled_at=gte.${BLOQUEO_DESDE.toISOString()}`,
        { headers }
      );
      if (!res.ok) throw new Error(`${tabla}: ${res.status}`);
      // Comparación exacta en el código (sin ilike: "_" y "*" son comodines).
      for (const r of await res.json()) {
        if ((r.email || "").trim().toLowerCase() === clave && r.canceled_at) {
          const t = new Date(r.canceled_at);
          if (!ultima || t > ultima) ultima = t;
        }
      }
    }
  } catch (err) {
    console.error("bloqueoPorBaja: no se pudo consultar", err.message);
    return null;
  }
  if (!ultima) return null;
  const hasta = finDelBloqueo(ultima);
  if (ahora >= hasta) return null;
  return { hasta, hastaLabel: fechaLarga(hasta) };
}

function respuestaBloqueo(b) {
  return {
    statusCode: 403,
    body: JSON.stringify({ error: "baja_reciente", hasta: b.hasta.toISOString(), hasta_label: b.hastaLabel }),
  };
}

module.exports = { BLOQUEO_DESDE, BLOQUEO_MESES, COMUNIDAD_CERRADA_DESDE, finDelBloqueo, fechaLarga, bloqueoPorBaja, respuestaBloqueo };
