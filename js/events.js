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
 *   venue        nombre del espacio (déjalo como "" si quieres reservar la ubicación
 *                exacta para el DFOS y no mostrarla en la web)
 *   flyer        ruta al flyer del encuentro (ej. "/assets/img/flyer-xxx.webp"), se
 *                muestra en miniatura junto a la fecha en las tarjetas. Déjalo como ""
 *                si todavía no hay flyer.
 *   flyerThumb   miniatura del flyer (unos 360px de ancho) para las tarjetas; si falta se usa flyer
 *   city         ciudad
 *   price        texto libre de precio, ej. "25-30€" o "Gratis"
 *   founderPrice texto libre de precio solo para fundadoras, ej. "15€" (déjalo como ""
 *                si este encuentro no tiene precio especial de preventa)
 *   founderTicketsUrl  Payment Link de Stripe para el precio de fundadora (solo se
 *                usa en preventa.html, déjalo como "" si no aplica)
 *   tag          "placer" | "movimiento" | "conocimiento" | "espiritualidad" —
 *                puede ser uno solo o un array con varios, ej. ["placer", "conocimiento"]
 *   facilitators texto libre, ej. "Julia Javkin" (deja "" si no aplica)
 *   description  1-2 frases, tono Fraccctal (sin épica, sin promesas)
 *   ticketsUrl   pega aquí el Payment Link de Stripe cuando lo tengas (solo encuentros abiertos)
 *   lumaUrl      link a la página del evento en Luma, si existe (para encuentros pasados)
 *   detailUrl    página propia del encuentro en la web (ej. "/encuentros/mi-encuentro").
 *                Si un encuentro pasado la tiene, la tarjeta enlaza ahí en vez de a Luma.
 *   startsAt     inicio con hora y zona, ISO (ej. "2026-10-24T17:00:00+02:00"); para Google
 *   endsAt       fin con hora y zona, ISO; para Google
 *   offers       lista de entradas a la venta, ej. [{ tier: "general", name: "General", price: 25 }];
 *                "tier" es la clave del tier en lib/events.js (para saber cuántas quedan); para Google
 *   publicSaleFrom  desde cuándo puede comprar cualquiera (fin de la preventa de socixs), ISO; para Google
 *   status       "abierto" | "agotado" | "cerrado" | "proximamente"
 *   oculto       true = tiene ficha (para revisarla con el enlace) pero no sale en
 *                listados, destacado de la home ni datos para buscadores. Opcional.
 */

const FRACCCTAL_EVENTS = [
  {
    id: "lo-que-el-hambre-sabe-2026-11",
    title: "Lo que el hambre sabe: Entender el antojo, amasar el snack",
    dateLabel: "28",
    dateMonth: "NOV",
    dateSort: "2026-11-28",
    venue: "María del Río",
    flyer: "/assets/img/flyer-lo-que-el-hambre-sabe.webp",
    flyerThumb: "/assets/img/flyer-lo-que-el-hambre-sabe-thumb.webp",
    city: "Madrid",
    price: "Early bird 25€ · General 30€ · Amigxs 55€ (2 entradas)",
    founderPrice: "",
    founderTicketsUrl: "/encuentros/lo-que-el-hambre-sabe",
    tag: ["conocimiento", "placer"],
    facilitators: "Kyriaki Erotokritou",
    description:
      "Un taller para entender qué nos pide el cuerpo cuando nos entran ganas de picar algo, y para preparárnoslo con nuestras propias manos.",
    ticketsUrl: "/encuentros/lo-que-el-hambre-sabe",
    lumaUrl: "",
    detailUrl: "/encuentros/lo-que-el-hambre-sabe",
    startsAt: "2026-11-28T17:00:00+01:00",
    endsAt: "2026-11-28T19:45:00+01:00",
    publicSaleFrom: "2026-11-01T00:00:00+01:00",
    offers: [
      { tier: "early", name: "Early bird", price: 25 },
      { tier: "general", name: "General", price: 30 },
      { tier: "amigxs", name: "Pack amigxs (2 entradas)", price: 55 },
    ],
    status: "abierto",
  },
  {
    id: "ver-de-oido-2026-12",
    title: "Ver de oído: reconocerse a través de la escucha",
    dateLabel: "17",
    dateMonth: "DIC",
    dateSort: "2026-12-17",
    venue: "", // por confirmar
    city: "Madrid",
    price: "Early bird 16€ · General 19€",
    founderPrice: "",
    founderTicketsUrl: "/encuentros/ver-de-oido",
    tag: ["placer", "conocimiento"],
    facilitators: "Lara Alcázar (ONDA Atelier Sonoro)",
    description:
      "Un taller para afinar la escucha, descubrir cómo lo que oímos guía lo que pensamos y sentimos, y recuperar tu propio criterio frente al algoritmo.",
    ticketsUrl: "/encuentros/ver-de-oido",
    lumaUrl: "",
    detailUrl: "/encuentros/ver-de-oido",
    startsAt: "2026-12-17T19:00:00+01:00",
    endsAt: "2026-12-17T21:30:00+01:00",
    publicSaleFrom: "2026-11-17T00:00:00+01:00",
    offers: [
      { tier: "early", name: "Early bird", price: 16 },
      { tier: "general", name: "General", price: 19 },
    ],
    status: "abierto",
  },
  {
    id: "la-erotica-del-buentrato-2026-10",
    title: "La erótica del buentrato",
    dateLabel: "24",
    dateMonth: "OCT",
    dateSort: "2026-10-24",
    venue: "Espacio en Blanco",
    flyer: "/assets/img/flyer-la-erotica-del-buentrato.webp",
    flyerThumb: "/assets/img/flyer-la-erotica-del-buentrato-thumb.webp",
    city: "Madrid",
    price: "General 25€",
    founderPrice: "",
    founderTicketsUrl: "/encuentros/la-erotica-del-buentrato",
    tag: ["placer", "conocimiento"],
    facilitators: "Yaneli García Ríos",
    description:
      "Taller teórico-práctico sobre lo que nos enseñaron a erotizar en los vínculos y qué pasa si movemos el deseo de sitio. Con movimiento y dinámicas en grupo.",
    ticketsUrl: "/encuentros/la-erotica-del-buentrato",
    lumaUrl: "",
    detailUrl: "/encuentros/la-erotica-del-buentrato",
    startsAt: "2026-10-24T17:00:00+02:00",
    endsAt: "2026-10-24T20:00:00+02:00",
    publicSaleFrom: "2026-10-01T00:00:00+02:00",
    offers: [{ tier: "general", name: "General", price: 25 }],
    status: "abierto",
  },
  {
    id: "una-vida-de-fantasia-2026-09",
    title: "Una vida de fantasía",
    dateLabel: "26",
    dateMonth: "SEP",
    dateSort: "2026-09-26",
    venue: "",
    flyer: "/assets/img/flyer-una-vida-de-fantasia.webp",
    flyerThumb: "/assets/img/flyer-una-vida-de-fantasia-thumb.webp",
    city: "Madrid",
    price: "Early bird 20€ · General 25€",
    founderPrice: "",
    founderTicketsUrl: "/encuentros/una-vida-de-fantasia",
    tag: "conocimiento",
    facilitators: "Marta Argüelles",
    description:
      "Taller de escritura para recuperar la imaginación, la curiosidad y el asombro propios de la infancia. No hace falta saber escribir, solo curiosidad.",
    ticketsUrl: "/encuentros/una-vida-de-fantasia",
    lumaUrl: "",
    detailUrl: "/encuentros/una-vida-de-fantasia",
    status: "cerrado",
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

// Un encuentro con hora de fin (endsAt) ya pasada se marca "cerrado" solo: sale
// de "próximos" y de los datos para buscadores, y pasa a "pasados" en el listado.
FRACCCTAL_EVENTS.forEach((e) => {
  if (e.endsAt && Date.parse(e.endsAt) <= Date.now()) e.status = "cerrado";
});
// Los próximos van primero y por orden de fecha (el más cercano arriba, que es
// también el destacado de la home); los pasados, del más reciente al más antiguo.
FRACCCTAL_EVENTS.sort((a, b) => {
  const pa = a.status === "cerrado", pb = b.status === "cerrado";
  if (pa !== pb) return pa ? 1 : -1;
  if (a.dateSort === b.dateSort) return 0;
  return (a.dateSort < b.dateSort ? -1 : 1) * (pa ? -1 : 1);
});

// Los encuentros con `oculto: true` se apartan de FRACCCTAL_EVENTS (que es lo que
// leen los listados); su ficha los encuentra igualmente con fraccctalEvento(id).
const FRACCCTAL_EVENTS_OCULTOS = [];
for (let i = FRACCCTAL_EVENTS.length - 1; i >= 0; i--) {
  if (FRACCCTAL_EVENTS[i].oculto) FRACCCTAL_EVENTS_OCULTOS.push(FRACCCTAL_EVENTS.splice(i, 1)[0]);
}

// Datos de un encuentro por su id (las fichas leen de aquí sus precios).
function fraccctalEvento(id) {
  return FRACCCTAL_EVENTS.concat(FRACCCTAL_EVENTS_OCULTOS).find((e) => e.id === id) || null;
}
