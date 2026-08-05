// Datos legales de la Asociación, centralizados acá para no repetirlos
// hardcodeados en cada página. Cuando lleguen el NIF definitivo y el resto
// de datos pendientes, se cambian UNA sola vez acá y se actualizan solas
// todas las páginas legales (aviso-legal.html, privacidad.html,
// condiciones.html) que los leen vía JS al cargar.
//
// EDITAR cuando estén disponibles:
const LEGAL = {
  RAZON_SOCIAL: "Asociación Cultural Fraccctal para la Exploración",
  NIF: "[NIF: pendiente de asignación]",
  DOMICILIO: "[dirección postal de contacto: pendiente]",
  EMAIL: "fraccctal.contact@gmail.com",
  REGISTRO: "Registro de Asociaciones de la Comunidad de Madrid, expediente 03/194250.9/26, en tramitación",
  // Versión del texto de condiciones que se le pide aceptar a cada persona.
  // Subir este número (o poner una fecha) cada vez que cambie el contenido
  // legal de condiciones.html, así el registro de consentimientos queda
  // ligado a QUÉ versión exacta aceptó cada quien.
  CONDICIONES_VERSION: "2026-08-v1",
};

// Rellena cualquier elemento con [data-legal="CLAVE"] con el valor de LEGAL.CLAVE.
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-legal]").forEach((el) => {
    const key = el.getAttribute("data-legal");
    if (LEGAL[key] !== undefined) el.textContent = LEGAL[key];
  });
});
