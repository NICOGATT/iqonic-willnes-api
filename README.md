# IQONIC THRIVE · API (Express + Supabase + Stripe)

API REST para el catálogo, los pagos con tarjeta (Stripe Checkout) y los enlaces de WhatsApp.
Usa la **misma tabla `products`** de Supabase que la web en Next.js (`../iqonic-thrive`).

## 1. Levantar en local

```bash
npm install
cp .env.example .env      # completa los valores (ver abajo)
npm run dev               # http://localhost:4000 (se reinicia al guardar)
```

Variables mínimas en `.env`:

| Variable | Dónde se obtiene |
|---|---|
| `SUPABASE_URL` | Supabase → **Connect** |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → **API Keys** → *secret* / *service_role*. ⚠️ Solo en el servidor. |
| `ADMIN_API_KEY` | Inventada por ti (≥ 24 caracteres): `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `STRIPE_SECRET_KEY` | Stripe → Developers → **API keys** → `sk_test_...` (modo prueba) |
| `WHATSAPP_NUMBER` | Tu número, solo dígitos con código de país |

Sin `STRIPE_SECRET_KEY` la API arranca igual: productos y WhatsApp funcionan y el checkout responde `503`.

## 2. Endpoints

| Método | Ruta | Protección | Descripción |
|---|---|---|---|
| GET | `/api/health` | — | Estado del servicio |
| GET | `/api/products` | — | Productos visibles (`?category=gummies\|energy\|hydration`) |
| GET | `/api/products/:idOrSlug` | — | Un producto |
| POST | `/api/products` | `x-api-key` | Crear producto |
| POST | `/api/create-checkout-session` | — | Crea el pago en Stripe y devuelve `url` |
| POST | `/api/whatsapp-link` | — | Devuelve el enlace de WhatsApp del producto |
| POST | `/api/webhooks/stripe` | Firma de Stripe | Stripe avisa de pagos completados |

Cada producto incluye `can_checkout` (tiene precio y Stripe está activo) y `whatsapp_url`.
Con eso el frontend decide qué botones mostrar: **"Pagar con tarjeta"** y/o **"Pedir por WhatsApp"**.

### Decisiones de seguridad
- **El precio nunca viene del cliente.** Si el body de checkout trae `price`, se ignora: se lee de Supabase.
  Si no, cualquiera podría modificar la petición y pagar $0,01.
- `POST /api/products` exige la API key (comparación de tiempo constante) y valida todos los campos.
- La clave `service_role` salta RLS: solo vive en este servidor y en `.env` (ignorado por git).
- CORS solo permite las webs de `ALLOWED_ORIGINS`.

## 3. Probar con cURL

> En Windows usa **Git Bash** para copiar estos comandos tal cual. En PowerShell, `curl` es un alias distinto: escribe `curl.exe`.

```bash
# Estado
curl http://localhost:4000/api/health

# Catálogo
curl http://localhost:4000/api/products

# Solo gomitas
curl "http://localhost:4000/api/products?category=gummies"

# Crear producto (cambia TU_ADMIN_API_KEY)
curl -X POST http://localhost:4000/api/products \
  -H "Content-Type: application/json" \
  -H "x-api-key: TU_ADMIN_API_KEY" \
  -d '{
    "name": "IQ FOCUS GUMMIES",
    "description": "Gomitas para concentración diaria.",
    "type": "Focus Gummies",
    "category": "gummies",
    "flavor": "Berry",
    "presentation_label": "60 Gummies",
    "presentation_detail": "Dietary Supplement",
    "price": 24.90,
    "image_url": "https://ejemplo.com/focus.png",
    "benefits": [{ "icon": "target", "label": "Enfoque" }, { "icon": "bolt", "label": "Energía mental" }]
  }'

# Pago con Stripe (usa un "id" de GET /api/products; el producto debe tener precio)
curl -X POST http://localhost:4000/api/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{ "productId": "UUID_DEL_PRODUCTO", "quantity": 2 }'
# → { "id": "cs_test_...", "url": "https://checkout.stripe.com/..." }  ← abre la url en el navegador

# Carrito con varios productos
curl -X POST http://localhost:4000/api/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{ "items": [ { "id": "UUID_1", "quantity": 1 }, { "id": "UUID_2", "quantity": 3 } ] }'

# Enlace de WhatsApp
curl -X POST http://localhost:4000/api/whatsapp-link \
  -H "Content-Type: application/json" \
  -d '{ "productId": "iq-protect-gummies", "quantity": 2 }'
```

**Tarjeta de prueba de Stripe:** `4242 4242 4242 4242`, cualquier fecha futura, cualquier CVC.
Tras pagar, Stripe vuelve a `FRONTEND_URL/pago/exito` (página incluida en la web Next.js).

### Postman
1. **New → HTTP Request**, método y URL de la tabla.
2. Para `POST`: pestaña **Body → raw → JSON** y pega el JSON del ejemplo.
3. Para crear productos: pestaña **Headers** → `x-api-key` = tu `ADMIN_API_KEY`.

### Respuestas de error
Todas tienen la forma `{ "error": "mensaje", "details": {...} }`:
`400` datos inválidos · `401` falta la API key · `404` no existe · `409` slug repetido o producto sin precio ·
`503` Stripe/WhatsApp sin configurar.

## 4. Webhook de Stripe (confirmar pagos)

El cliente puede cerrar la pestaña antes de volver a `/pago/exito`. Por eso la confirmación fiable del cobro
llega por el webhook. En local, con la [Stripe CLI](https://docs.stripe.com/stripe-cli):

```bash
stripe login
stripe listen --forward-to localhost:4000/api/webhooks/stripe
# Copia el "whsec_..." que imprime a STRIPE_WEBHOOK_SECRET en .env y reinicia la API
```

Al pagar verás en la consola `💳 Pago completado · sesión cs_test_...`.
**Siguiente paso:** guardar cada pedido en una tabla `orders` de Supabase (ver el `TODO` en `src/routes/webhooks.js`).

## 5. Estructura

```
src/
  server.js              # Arranca el servidor
  app.js                 # Express: CORS, JSON, rutas, errores
  config.js              # Lee y valida .env
  lib/
    supabase.js          # Cliente de Supabase (service role)
    stripe.js            # Cliente de Stripe + conversión a centavos
    products.js          # Formato público de productos y búsqueda por id/slug
    whatsapp.js          # Mensaje y enlace wa.me
    http.js              # HttpError
  middleware/
    requireApiKey.js     # Protección de rutas de admin
    errors.js            # 404 y manejador global de errores
  routes/
    products.js          # GET/POST /api/products
    checkout.js          # /api/create-checkout-session y /api/whatsapp-link
    webhooks.js          # /api/webhooks/stripe
```

## Nota sobre la web Next.js

Los productos creados con esta API aparecen en la web en como máximo **1 hora** (la portada usa caché).
Los creados desde el panel `/admin` de la web aparecen al instante.
