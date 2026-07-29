# fraccctal.com

Sitio estático (HTML/CSS/JS puro, sin build, sin Node). Se puede editar con cualquier
editor de texto y previsualizar abriendo los archivos en un navegador o sirviendo la
carpeta localmente.

## Ver el sitio en tu computadora

Desde esta carpeta:

```
python3 -m http.server 8000
```

y abre `http://localhost:8000` en el navegador.

## Añadir o editar un encuentro

Todo vive en [`js/events.js`](js/events.js). Cada encuentro es un bloque como este:

```js
{
  id: "mi-encuentro-2026-10",
  title: "Título del encuentro",
  dateLabel: "12",
  dateMonth: "OCT",
  dateSort: "2026-10-12",
  venue: "Nombre del espacio",
  city: "Madrid",
  price: "25–30€",
  tag: "conocimiento",
  description: "Una o dos frases, tono Fraccctal.",
  ticketsUrl: "PEGAR_AQUI_EL_LINK_DE_STRIPE",
  status: "abierto",
}
```

`status` puede ser `"abierto"`, `"agotado"`, `"cerrado"` o `"proximamente"`. El encuentro
más próximo (o el primero marcado `"proximamente"`) es el que se muestra destacado en la
home. Todos aparecen en `encuentros.html`.

## Conectar Stripe (venta de entradas)

Como el sitio es estático, no hace falta programar un backend: se usan **Payment Links**
de Stripe.

1. Entra a tu [Dashboard de Stripe](https://dashboard.stripe.com) → **Payment Links**.
2. Crea un producto por encuentro (nombre, precio, cantidad/aforo si quieres limitarlo).
3. Copia el link que te da Stripe y pégalo en el campo `ticketsUrl` de ese encuentro en
   `js/events.js`.
4. Listo. El botón "Reservar" de esa tarjeta ya lleva directo al checkout de Stripe.

Cuando decidan activar el cobro de la membresía (enero 2027), el mismo mecanismo sirve
para una suscripción recurrente: Stripe Payment Links soporta pagos únicos y recurrentes.

## Publicar el sitio (fraccctal.com)

Recomendado: **Vercel** o **Netlify**, ambos gratuitos para un sitio estático como este.

1. Sube esta carpeta a un repositorio de GitHub.
2. En Vercel/Netlify: "New Project" → conectar ese repo → deploy (no hace falta build
   command, es un sitio estático).
3. En el panel del proyecto, agrega `fraccctal.com` como dominio personalizado.
4. Vercel/Netlify te van a dar 1-2 registros DNS (normalmente un `A` y/o `CNAME`) para
   configurar en el panel de donde compraron el dominio.

Avísame cuando quieran hacer este paso y lo hacemos juntos. Implica tocar el DNS del
dominio real, así que lo hago solo con vosotras presentes.

## Fotos del equipo

En `quienes-somos.html` hay dos placeholders (`[Foto de Irina]`, `[Foto de Nat]`). Para
poner las fotos reales:

1. Guarda los archivos como `assets/img/irina.jpg` y `assets/img/nat.jpg`.
2. Reemplaza cada `<div class="team__photo"><span>[Foto de ...]</span></div>` por
   `<div class="team__photo"><img src="assets/img/irina.jpg" alt="Irina"></div>`.

## Qué falta (a propósito, para v1)

- Pegar los Payment Links reales de Stripe en `js/events.js`.
- Sumar fotos reales del equipo (ver arriba) y de encuentros pasados en `assets/img/`.
- Confirmar fecha/venue/precio del encuentro de septiembre en `js/events.js`
  (hoy está como placeholder, marcado `[EDITAR]`).
- Si quieren un embed real de Substack en vez del botón que linkea afuera, pásame la URL
  exacta de la publicación (`https://TUPUBLICACION.substack.com`).
