/**
 * Encuentros de Fraccctal.
 *
 * Para añadir un encuentro nuevo, copia un objeto de este array y edita los
 * valores. Los campos son:
 *
 *   id           identificador único, sin espacios (ej. "umbral-2026-05")
 *   title        título del encuentro
 *   dateLabel    lo que se ve en la tarjeta, ej. "30" (día); ver dateMonth
 *   dateMonth    mes abreviado en mayúsculas, ej. "MAY"
 *   dateSort     fecha ISO "AAAA-MM-DD" (se usa solo para ordenar, no se muestra)
 *   venue        nombre del espacio (dejalo como "" si querés reservar la ubicación
 *                exacta para el DFOS y no mostrarla en la web)
 *   city         ciudad
 *   price        texto libre de precio, ej. "25-30€" o "Gratis"
 *   tag          "placer" | "movimiento" | "conocimiento" | "espiritualidad"
 *   facilitators texto libre, ej. "Julia Javkin" (deja "" si no aplica)
 *   description  1-2 frases, tono Fraccctal (sin épica, sin promesas)
 *   ticketsUrl   pega aquí el Payment Link de Stripe cuando lo tengas (solo encuentros abiertos)
 *   lumaUrl      link a la página del evento en Luma, si existe (para encuentros pasados)
 *   status       "abierto" | "agotado" | "cerrado" | "proximamente"
 */

const FRACCCTAL_EVENTS = [
  {
    id: "una-vida-de-fantasia-2026-09",
    title: "Una vida de fantasía",
    dateLabel: "26",
    dateMonth: "SEP",
    dateSort: "2026-09-26",
    venue: "",
    city: "Madrid",
    price: "Early bird 20€ · General 25€",
    tag: "conocimiento",
    facilitators: "Marta Argüelles",
    description:
      "Taller de escritura para recuperar la imaginación, la curiosidad y el asombro propios de la infancia. No hace falta saber escribir, solo curiosidad.",
    ticketsUrl: "PEGAR_AQUI_EL_LINK_DE_STRIPE",
    lumaUrl: "",
    status: "abierto",
  },
  {
    id: "una-voz-posible-2026-06",
    title: "Una Voz Posible",
    dateLabel: "27",
    dateMonth: "JUN",
    dateSort: "2026-06-27",
    venue: "Timbre 4",
    city: "Madrid",
    price: "Early Bird 16€ · General 22€",
    tag: "placer",
    facilitators: "Nat Bieler",
    description:
      "Exploración vocal desde la escucha, no desde el rendimiento. Tres horas para acercarte a tu voz a través de la respiración, la vibración y la resonancia.",
    ticketsUrl: "",
    lumaUrl: "https://luma.com/2m5uw339",
    status: "cerrado",
  },
  {
    id: "un-cuerpo-expresivo-2026-05",
    title: "Un Cuerpo Expresivo",
    dateLabel: "30",
    dateMonth: "MAY",
    dateSort: "2026-05-30",
    venue: "Broadway House",
    city: "Madrid",
    price: "Early Bird 15€ · General 19€",
    tag: "movimiento",
    facilitators: "Mónica Acevedo",
    description:
      "Taller de práctica escénica para bajar el volumen del discurso y subir el del cuerpo. Sin terapia, sin interpretación, sin prisa.",
    ticketsUrl: "",
    lumaUrl: "https://luma.com/bava5lug",
    status: "cerrado",
  },
];

// No tocar de aquí para abajo: esto ordena y expone el array.
FRACCCTAL_EVENTS.sort((a, b) => (a.dateSort < b.dateSort ? 1 : -1));
