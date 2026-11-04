// Aviso de cookies y píxel de Meta.
//
// El píxel NO se carga hasta que la persona pulsa "Aceptar". Con "Rechazar" (o
// sin decidir) no se descarga nada de Meta ni se crea ninguna cookie. La
// decisión se guarda en localStorage y se puede cambiar desde el enlace
// "Cookies" del pie de página.
//
// Las páginas avisan de lo que pasa con fraccctalTrack("Evento", {datos}, id):
// los eventos se encolan hasta que haya decisión; si es "Rechazar" se descartan.
(function () {
  var PIXEL_ID = "1659500895960902";
  var KEY = "fraccctal_consent";

  function leer() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function guardar(v) {
    try { localStorage.setItem(KEY, v); } catch (e) {}
  }

  var cola = [];
  var cargado = false;

  function cargarPixel() {
    if (cargado) return;
    cargado = true;
    /* Código base oficial del píxel de Meta */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", PIXEL_ID);
    window.fbq("track", "PageView");
    while (cola.length) enviar(cola.shift());
  }

  function enviar(ev) {
    window.fbq("track", ev.nombre, ev.datos || {}, ev.id ? { eventID: ev.id } : {});
  }

  window.fraccctalTrack = function (nombre, datos, id) {
    var ev = { nombre: nombre, datos: datos, id: id };
    var c = leer();
    if (c === "granted") { cargarPixel(); enviar(ev); }
    else if (c !== "denied") cola.push(ev);
  };

  // Marca de alta en curso: la web vuelve de Stripe a otra página (el espacio de
  // socixs), que es donde se dispara CompleteRegistration.
  var ALTA_KEY = "fraccctal_alta";
  window.fraccctalIrAlPago = function (url, datos, alta) {
    window.fraccctalTrack("InitiateCheckout", datos);
    if (alta) {
      try { localStorage.setItem(ALTA_KEY, JSON.stringify({ tipo: alta, ts: Date.now() })); } catch (e) {}
    }
    // Pequeña pausa para que el navegador alcance a enviar el evento antes de salir.
    setTimeout(function () { location.href = url; }, 250);
  };
  // Devuelve (y borra) la alta en curso si es reciente (menos de 3 horas).
  window.fraccctalAltaPendiente = function () {
    try {
      var a = JSON.parse(localStorage.getItem(ALTA_KEY) || "null");
      localStorage.removeItem(ALTA_KEY);
      return a && Date.now() - a.ts < 3 * 3600 * 1000 ? a.tipo : null;
    } catch (e) { return null; }
  };

  function borrarCookiesMeta() {
    ["_fbp", "_fbc"].forEach(function (n) {
      var host = location.hostname.split(".").slice(-2).join(".");
      document.cookie = n + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=." + host;
      document.cookie = n + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    });
  }

  function decidir(valor) {
    var antes = leer();
    guardar(valor);
    cerrarBanner();
    if (valor === "granted") cargarPixel();
    else {
      cola.length = 0;
      borrarCookiesMeta();
      // Si ya se había cargado el píxel en esta visita, se recarga para cortarlo.
      if (cargado || antes === "granted") location.reload();
    }
  }

  var banner = null;

  function estilos() {
    if (document.getElementById("consent-css")) return;
    var st = document.createElement("style");
    st.id = "consent-css";
    st.textContent =
      ".consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;max-width:640px;margin:0 auto;" +
      "background:var(--bg,#EDEAE1);color:var(--ink,#17160f);border:1px solid var(--ink,#17160f);" +
      "padding:20px 22px;font:15px/1.5 var(--sans,system-ui,sans-serif);box-shadow:0 8px 30px rgba(0,0,0,.18)}" +
      ".consent p{margin:0 0 14px}" +
      ".consent a{text-decoration:underline}" +
      ".consent__btns{display:flex;gap:10px;flex-wrap:wrap}" +
      ".consent__btn{flex:1 1 140px;font:inherit;font-weight:500;padding:11px 18px;cursor:pointer;" +
      "background:transparent;color:var(--ink,#17160f);border:1px solid var(--ink,#17160f);border-radius:0}" +
      ".consent__btn:hover,.consent__btn:focus-visible{background:var(--ink,#17160f);color:var(--bg,#EDEAE1)}" +
      ".consent-link{background:none;border:0;padding:0;font:inherit;color:inherit;text-decoration:underline;cursor:pointer}";
    document.head.appendChild(st);
  }

  function abrirBanner() {
    if (banner) return;
    estilos();
    banner = document.createElement("div");
    banner.className = "consent";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Cookies");
    banner.innerHTML =
      "<p>Si aceptas, usamos el píxel de Meta para saber qué anuncios funcionan y no volver a enseñártelos si ya " +
      "te apuntaste. Si rechazas, no se carga nada de Meta y la web funciona igual. Puedes cambiarlo cuando quieras " +
      'desde «Cookies» en el pie. <a href="/privacidad.html#cookies">Más información</a>.</p>' +
      '<div class="consent__btns">' +
      '<button type="button" class="consent__btn" data-v="granted">Aceptar</button>' +
      '<button type="button" class="consent__btn" data-v="denied">Rechazar</button>' +
      "</div>";
    banner.addEventListener("click", function (e) {
      var v = e.target && e.target.getAttribute && e.target.getAttribute("data-v");
      if (v) decidir(v);
    });
    document.body.appendChild(banner);
  }

  function cerrarBanner() {
    if (banner) { banner.remove(); banner = null; }
  }

  function enlacePie() {
    var pie = document.querySelector(".footer__bottom");
    if (!pie || pie.querySelector(".consent-link")) return;
    pie.appendChild(document.createTextNode(" · "));
    var b = document.createElement("button");
    b.type = "button";
    b.className = "consent-link";
    b.textContent = "Cookies";
    b.addEventListener("click", abrirBanner);
    pie.appendChild(b);
  }

  function iniciar() {
    enlacePie();
    var c = leer();
    if (c === "granted") cargarPixel();
    else if (c !== "denied") abrirBanner();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
