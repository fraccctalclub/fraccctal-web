// Catálogo de encuentros puntuales (talleres): cupo de sala, precios de
// Stripe y fecha de preventa exclusiva para socias. event-status.js y
// create-event-checkout.js leen de acá en vez de tener un EVENT_ID fijo —
// así se puede vender más de un encuentro a la vez sin que se pisen los
// cupos ni las Checkout Sessions.
//
// Para publicar un encuentro nuevo: agregá una entrada acá con sus price ID
// reales de Stripe. Si un price ID se queda con el placeholder TODO_..., la
// función que lo use devuelve un error explícito en vez de vender con un
// precio roto (ver tiersReady más abajo).

const PRICE_OCT_EARLY = "price_1UGeEUCYD2PjyybimcgEWon8";
const PRICE_OCT_GENERAL = "price_1UGeEUCYD2PjyybiiwNjWzxP";
const PRICE_OCT_AMIGXS = "price_1UGeEUCYD2Pjyybiu6zkPUyJ";

const EVENTS = {
  "una-vida-de-fantasia-2026-09": {
    slug: "/encuentros/una-vida-de-fantasia",
    roomCap: 16,
    membersOnlyUntil: "2026-09-01T00:00:00+02:00",
    tiers: {
      early: { price: "price_1U3d6yCYD2PjyybiCY6yxF0l", cap: 4, seats: 1 },
      general: { price: "price_1U3d6zCYD2Pjyybiz6N4KB4B", cap: 12, seats: 1 },
      amigxs: { price: "price_1UGcXVCYD2Pjyybiwi8zI9sF", cap: 8, seats: 2 },
    },
  },
  "la-erotica-del-buentrato-2026-10": {
    slug: "/encuentros/la-erotica-del-buentrato",
    roomCap: 16,
    membersOnlyUntil: "2026-10-01T00:00:00+02:00",
    tiers: {
      early: { price: PRICE_OCT_EARLY, cap: 4, seats: 1 },
      general: { price: PRICE_OCT_GENERAL, cap: 12, seats: 1 },
      amigxs: { price: PRICE_OCT_AMIGXS, cap: 8, seats: 2 },
    },
  },
};

const DEFAULT_EVENT_ID = "una-vida-de-fantasia-2026-09";

// Lookup seguro: nunca indexar EVENTS directamente con un id que venga del
// cliente (evita pisar propiedades heredadas del objeto, tipo "constructor").
function getEvent(eventId) {
  if (typeof eventId !== "string") return null;
  if (!Object.prototype.hasOwnProperty.call(EVENTS, eventId)) return null;
  return EVENTS[eventId];
}

// Antes de crear una Checkout Session, confirmar que ese encuentro ya tiene
// los price ID reales pegados (ninguno se quedó en el placeholder TODO_...).
function tiersReady(eventConfig) {
  return Object.values(eventConfig.tiers).every((t) => !String(t.price).startsWith("TODO_"));
}

module.exports = { EVENTS, DEFAULT_EVENT_ID, getEvent, tiersReady };
