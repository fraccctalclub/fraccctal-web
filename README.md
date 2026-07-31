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

## Membresía fundadora (pago diferido + login + preventa)

Esto sí necesita un poquito de backend (a diferencia del resto del sitio), pero corre como
**Netlify Functions** — no hace falta servidor propio ni Node instalado en tu computadora,
Netlify lo corre todo en su nube. Cuando alguien se anota en `membresia.html`:

1. Se crea una suscripción de Stripe de 11€/mes que **no cobra nada hoy** — el cobro real
   arranca el 3 de enero de 2027 para todas las fundadoras por igual, sin importar el día
   en que se anotaron.
2. Al confirmarse el pago, Stripe le avisa a nuestra función `stripe-webhook`, que guarda a
   la persona en Supabase y le manda su primer **magic link** (login sin contraseña) para
   entrar a `preventa.html`, donde ve los encuentros con su precio de fundadora.

### Paso 1 — Crear el proyecto de Supabase (gratis)

1. Entra a [supabase.com](https://supabase.com) y crea una cuenta con tu email.
2. Creá un proyecto nuevo (cualquier nombre, por ejemplo "fraccctal").
3. En el **SQL Editor** del proyecto, pega y ejecutá esto para crear la tabla de fundadoras:

```sql
create table founders (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text default 'active',
  created_at timestamptz default now()
);
```

4. En **Project Settings → API**, copiá dos valores:
   - `Project URL` → esto es `SUPABASE_URL`
   - `anon public key` → esto es `SUPABASE_ANON_KEY`
   - `service_role key` (está más abajo, marcada como secreta) → esto es
     `SUPABASE_SERVICE_ROLE_KEY`

5. Pegá `SUPABASE_URL` y `SUPABASE_ANON_KEY` directamente en [`js/auth.js`](js/auth.js),
   reemplazando `PEGAR_URL_DE_SUPABASE` y `PEGAR_ANON_KEY_DE_SUPABASE` (estas dos son
   públicas a propósito, no hay problema en que estén en el código).

### Paso 2 — Crear el producto en Stripe (empezar en modo test)

**Importante:** el modo test de Stripe funciona ya mismo, sin esperar a que la asociación
cultural esté aprobada — esa aprobación solo hace falta para el modo *live* (cobrar plata
real). Armamos y probamos todo esto en modo test primero.

1. En el [Dashboard de Stripe](https://dashboard.stripe.com), asegurate de estar en modo
   **Test** (interruptor arriba a la derecha).
2. Productos → Crear producto: "Membresía Fundadora", precio 11€, recurrente mensual.
   Copiá el **Price ID** (empieza con `price_...`) → esto es `STRIPE_FOUNDER_PRICE_ID`.
3. Developers → API keys → copiá la **Secret key** de test (`sk_test_...`) → esto es
   `STRIPE_SECRET_KEY`.
4. Developers → Webhooks → Add endpoint:
   - URL: `https://fraccctal.com/.netlify/functions/stripe-webhook`
   - Evento a escuchar: `checkout.session.completed`
   - Copiá el **Signing secret** (`whsec_...`) → esto es `STRIPE_WEBHOOK_SECRET`.

### Paso 3 — Cargar las variables de entorno en Netlify

En Netlify: tu sitio → **Site configuration → Environment variables** → agregá una por una:

`STRIPE_SECRET_KEY`, `STRIPE_FOUNDER_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`.

Después de cargarlas, hay que volver a desplegar para que las funciones las lean (con
arrastrar la carpeta de nuevo alcanza).

### Cuando llegue la aprobación de la asociación (pasar a modo live)

Repetís el Paso 2 pero con el interruptor en modo **Live** en vez de Test, y reemplazás las
tres variables de Stripe (`STRIPE_SECRET_KEY`, `STRIPE_FOUNDER_PRICE_ID`,
`STRIPE_WEBHOOK_SECRET`) por las nuevas de modo live en Netlify. No hay que tocar ni una
línea de código.

### Precio de fundadora por encuentro (preventa)

En cada encuentro de [`js/events.js`](js/events.js) hay dos campos opcionales:
`founderPrice` (el precio especial, ej. `"15€"`) y `founderTicketsUrl` (su Payment Link de
Stripe aparte, si querés un precio distinto al público). Mientras estén vacíos, la preventa
muestra el precio público con el botón deshabilitado.

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
- Crear la cuenta de Supabase y el producto de Stripe para la membresía (ver sección de
  arriba) y cargar las variables de entorno en Netlify.
- Confirmar fecha/venue/precio del encuentro de septiembre en `js/events.js`.
