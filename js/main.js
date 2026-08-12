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

function upcomingCardHTML(event) {
  const tagClass = event.tag === "reflexion" ? " tag--reflexion" : "";
  const metaParts = [event.venue, event.city, event.price].filter(Boolean);
  return `
    <article class="event-card">
      <div class="event-card__date">
        ${event.dateLabel}
        <span>${event.dateMonth}</span>
      </div>
      <div class="event-card__body">
        <span class="tag${tagClass}">${event.tag}</span>
        <h3>${event.title}</h3>
        <p class="event-card__meta">${metaParts.join(" · ")}</p>
        <p>${event.description}</p>
      </div>
      <div class="event-card__action">${ticketButton(event)}</div>
    </article>
  `;
}

function pastCardHTML(event) {
  const tagClass = event.tag === "reflexion" ? " tag--reflexion" : "";
  const credit = event.facilitators ? `Con ${event.facilitators} · ` : "";
  const action = event.lumaUrl
    ? `<a class="btn btn--ghost" href="${event.lumaUrl}" target="_blank" rel="noopener">Ver en Luma</a>`
    : `<span class="btn btn--disabled">Encuentro pasado</span>`;
  return `
    <article class="event-card event-card--closed">
      <div class="event-card__date">
        ${event.dateLabel}
        <span>${event.dateMonth}</span>
      </div>
      <div class="event-card__body">
        <span class="tag${tagClass}">${event.tag}</span>
        <h3>${event.title}</h3>
        <p class="event-card__meta">${credit}${event.venue} · ${event.city}</p>
        <p>${event.description}</p>
      </div>
      <div class="event-card__action">${action}</div>
    </article>
  `;
}

function founderCardHTML(event) {
  const tagClass = event.tag === "reflexion" ? " tag--reflexion" : "";
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
      <div class="event-card__date">
        ${event.dateLabel}
        <span>${event.dateMonth}</span>
      </div>
      <div class="event-card__body">
        <span class="tag${tagClass}">${event.tag}</span>
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

function injectEventSchema() {
  if (typeof FRACCCTAL_EVENTS === "undefined") return;
  const upcoming = FRACCCTAL_EVENTS.filter(
    (e) => e.status !== "cerrado" && e.dateSort && e.title
  );
  if (!upcoming.length) return;

  const schema = upcoming.map((e) => ({
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    startDate: e.dateSort,
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
  }));

  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(schema.length === 1 ? schema[0] : schema);
  document.head.appendChild(script);
}

document.addEventListener("DOMContentLoaded", initNav);
