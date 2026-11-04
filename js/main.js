// Nav y render de encuentros a partir de events.js

function initNav() {
  const toggle = document.querySelector(".nav__toggle");
  const links = document.querySelector(".nav__links");
  if (!toggle || !links) return;
  toggle.addEventListener("click", () => {
    const isOpen = links.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
}

function ticketButton(event) {
  const hasLink = event.ticketsUrl && event.ticketsUrl !== "PEGAR_AQUI_EL_LINK_DE_STRIPE";

  if (event.status === "agotado") {
    return `<span class="btn btn--disabled">Agotado</span>`;
  }
  if (event.status === "proximamente" && !hasLink) {
    return `<span class="btn btn--disabled">Fecha por confirmar</span>`;
  }
  if (!hasLink) {
    return `<span class="btn btn--disabled">Entradas próximamente</span>`;
  }
  const isExternal = event.ticketsUrl.startsWith("http");
  const attrs = isExternal ? ' target="_blank" rel="noopener"' : "";
  return `<a class="btn btn--primary" href="${event.ticketsUrl}"${attrs}>Reservar</a>`;
}

// event.tag puede ser un string ("placer") o un array de varios
// ("placer", "conocimiento") — se pinta un <span class="tag"> por cada uno.
function tagsHTML(event) {
  const tags = Array.isArray(event.tag) ? event.tag : [event.tag];
  return tags
    .filter(Boolean)
    .map((t) => `<span class="tag${t === "reflexion" ? " tag--reflexion" : ""}">${t}</span>`)
    .join("");
}

function dateBlockHTML(event) {
  const thumbSrc = event.flyerThumb || event.flyer;
  const thumb = thumbSrc
    ? `<img class="event-card__thumb" src="${thumbSrc}" alt="" loading="lazy">`
    : "";
  return `
    <div class="event-card__datewrap">
      ${thumb}
      <div class="event-card__date">
        ${event.dateLabel}
        <span>${event.dateMonth}</span>
      </div>
    </div>
  `;
}

function upcomingCardHTML(event) {
  const metaParts = [event.venue, event.city, event.price].filter(Boolean);
  return `
    <article class="event-card">
      ${dateBlockHTML(event)}
      <div class="event-card__body">
        ${tagsHTML(event)}
        <h3>${event.title}</h3>
        <p class="event-card__meta">${metaParts.join(" · ")}</p>
        <p>${event.description}</p>
      </div>
      <div class="event-card__action">${ticketButton(event)}</div>
    </article>
  `;
}

function pastCardHTML(event) {
  const credit = event.facilitators ? `Con ${event.facilitators} · ` : "";
  const action = event.detailUrl
    ? `<a class="btn btn--ghost" href="${event.detailUrl}">Ver encuentro</a>`
    : event.lumaUrl
    ? `<a class="btn btn--ghost" href="${event.lumaUrl}" target="_blank" rel="noopener">Ver en Luma</a>`
    : `<span class="btn btn--disabled">Encuentro pasado</span>`;
  const meta = [event.venue, event.city].filter(Boolean).join(" · ");
  return `
    <article class="event-card event-card--closed">
      ${dateBlockHTML(event)}
      <div class="event-card__body">
        ${tagsHTML(event)}
        <h3>${event.title}</h3>
        <p class="event-card__meta">${credit}${meta}</p>
        <p>${event.description}</p>
      </div>
      <div class="event-card__action">${action}</div>
    </article>
  `;
}

function founderCardHTML(event) {
  const metaParts = [event.venue, event.city].filter(Boolean);
  const hasFounderPrice = Boolean(event.founderPrice);
  const priceLine = hasFounderPrice
    ? `<span class="tag">Precio fundadora: ${event.founderPrice}</span>`
    : `<span class="tag">${event.price || "Precio fundadora próximamente"}</span>`;
  const hasFounderLink = event.founderTicketsUrl && event.founderTicketsUrl !== "";
  const isExternalFounderLink = hasFounderLink && event.founderTicketsUrl.startsWith("http");
  const founderAttrs = isExternalFounderLink ? ' target="_blank" rel="noopener"' : "";
  const founderLabel = hasFounderPrice ? "Reservar con precio fundadora" : "Ver entradas";
  const action = hasFounderLink
    ? `<a class="btn btn--primary" href="${event.founderTicketsUrl}"${founderAttrs}>${founderLabel}</a>`
    : `<span class="btn btn--disabled">Preventa próximamente</span>`;
  return `
    <article class="event-card">
      ${dateBlockHTML(event)}
      <div class="event-card__body">
        ${tagsHTML(event)}
        <h3>${event.title}</h3>
        <p class="event-card__meta">${metaParts.join(" · ")}</p>
        <p>${event.description}</p>
        <p style="margin-top:10px">${priceLine}</p>
      </div>
      <div class="event-card__action">${action}</div>
    </article>
  `;
}

function renderFounderEvents(containerId) {
  const el = document.getElementById(containerId);
  if (!el || typeof FRACCCTAL_EVENTS === "undefined") return;
  const upcoming = FRACCCTAL_EVENTS.filter((e) => e.status !== "cerrado");
  el.innerHTML = upcoming.length
    ? upcoming.map(founderCardHTML).join("")
    : `<p>Todavía no hay encuentros abiertos para preventa.</p>`;
}

function renderFeaturedEvent(containerId) {
  const el = document.getElementById(containerId);
  if (!el || typeof FRACCCTAL_EVENTS === "undefined") return;
  const next =
    FRACCCTAL_EVENTS.find((e) => e.status === "abierto") ||
    FRACCCTAL_EVENTS.find((e) => e.status === "proximamente") ||
    FRACCCTAL_EVENTS.find((e) => e.status !== "cerrado");
  if (!next) return;
  el.innerHTML = upcomingCardHTML(next);
}

function renderEventsList(upcomingId, pastId) {
  if (typeof FRACCCTAL_EVENTS === "undefined") return;
  const upcomingEl = document.getElementById(upcomingId);
  const pastEl = pastId ? document.getElementById(pastId) : null;

  const upcoming = FRACCCTAL_EVENTS.filter((e) => e.status !== "cerrado");
  const past = FRACCCTAL_EVENTS.filter((e) => e.status === "cerrado");

  if (upcomingEl) {
    upcomingEl.innerHTML = upcoming.length
      ? upcoming.map(upcomingCardHTML).join("")
      : `<p>Todavía no hay fecha confirmada. Suscríbete al newsletter para enterarte antes que nadie.</p>`;
  }
  if (pastEl) {
    pastEl.innerHTML = past.map(pastCardHTML).join("");
  }
}

// Disponibilidad de una entrada para Google: PreOrder mientras solo pueden comprar
// socixs, InStock cuando queda y SoldOut cuando se agota.
function availabilityDe(e, quedan) {
  if (quedan === 0) return "https://schema.org/SoldOut";
  if (e.publicSaleFrom && Date.now() < Date.parse(e.publicSaleFrom)) return "https://schema.org/PreOrder";
  return "https://schema.org/InStock";
}

async function injectEventSchema() {
  if (typeof FRACCCTAL_EVENTS === "undefined") return;
  const upcoming = FRACCCTAL_EVENTS.filter(
    (e) => e.status !== "cerrado" && e.dateSort && e.title
  );
  if (!upcoming.length) return;

  const abs = (u) => (u && u.startsWith("/") ? `https://fraccctal.com${u}` : u);
  const construir = (estados) => upcoming.map((e, i) => {
    const estado = estados[i];
    const item = {
      "@context": "https://schema.org",
      "@type": "Event",
      name: e.title,
      startDate: e.startsAt || e.dateSort,
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      eventStatus: "https://schema.org/EventScheduled",
      location: {
        "@type": "Place",
        name: e.venue || e.city,
        address: e.city,
      },
      description: e.description,
      organizer: {
        "@type": "Organization",
        name: "Fraccctal",
        url: "https://fraccctal.com/",
      },
    };
    if (e.endsAt) item.endDate = e.endsAt;
    if (e.flyer) item.image = abs(e.flyer);
    if (e.facilitators) item.performer = { "@type": "Person", name: e.facilitators };
    if (e.offers && e.offers.length) {
      item.offers = e.offers.map((o) => {
        const quedan = estado && o.tier && estado[o.tier] ? estado[o.tier].quedan : null;
        const offer = {
          "@type": "Offer",
          name: o.name,
          price: String(o.price),
          priceCurrency: "EUR",
          url: abs(e.ticketsUrl) || "https://fraccctal.com/encuentros.html",
          availability: availabilityDe(e, quedan),
        };
        if (e.publicSaleFrom) offer.validFrom = e.publicSaleFrom;
        return offer;
      });
    }
    return item;
  });
  const serializar = (estados) => {
    const schema = construir(estados);
    return JSON.stringify(schema.length === 1 ? schema[0] : schema);
  };

  // Primero, sin esperar a la red (Google puede fotografiar la página antes de
  // que termine un fetch): la disponibilidad se deduce solo de las fechas.
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = serializar([]);
  document.head.appendChild(script);

  // Después, con las plazas que quedan de cada tier en directo.
  const estados = await Promise.all(
    upcoming.map((e) =>
      fetch(`/.netlify/functions/event-status?event=${encodeURIComponent(e.id)}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    )
  );
  if (estados.some(Boolean)) script.textContent = serializar(estados);
}

document.addEventListener("DOMContentLoaded", initNav);
