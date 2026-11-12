import { Router } from "express";

import { config } from "../config.js";
import { HttpError } from "../lib/http.js";
import { findActiveProduct, isUuid } from "../lib/products.js";
import { stripe, toStripeAmount } from "../lib/stripe.js";
import { supabase } from "../lib/supabase.js";
import { productWhatsAppMessage, whatsAppUrl } from "../lib/whatsapp.js";

export const checkoutRouter = Router();

const MAX_ITEMS = 20;
const MAX_QTY = 20;

/**
 * Acepta un producto o un carrito:
 *   { "productId": "...", "quantity": 2 }
 *   { "items": [{ "id": "...", "quantity": 1 }, ...] }
 * Agrupa IDs repetidos y valida cantidades.
 */
function parseItems(body) {
  const list = Array.isArray(body?.items)
    ? body.items
    : body?.productId || body?.id
      ? [{ id: body.productId ?? body.id, quantity: body.quantity ?? 1 }]
      : [];

  if (list.length === 0) throw new HttpError(400, 'Envía "productId" o "items": [{ "id", "quantity" }]');
  if (list.length > MAX_ITEMS) throw new HttpError(400, `Máximo ${MAX_ITEMS} productos por compra`);

  const merged = new Map();
  for (const item of list) {
    const id = String(item?.id ?? item?.productId ?? "");
    const quantity = Number(item?.quantity ?? 1);
    if (!isUuid(id)) throw new HttpError(400, `ID de producto inválido: "${id}"`);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
      throw new HttpError(400, `La cantidad debe ser un entero entre 1 y ${MAX_QTY}`);
    }
    merged.set(id, Math.min(MAX_QTY, (merged.get(id) ?? 0) + quantity));
  }
  return [...merged].map(([id, quantity]) => ({ id, quantity }));
}

// ---------------------------------------------------------------------
// POST /api/create-checkout-session → URL de pago de Stripe
//
// ⚠️ SEGURIDAD: si el body trae "price", se IGNORA. El precio siempre se lee
// de Supabase; si se confiara en el cliente, cualquiera podría pagar $0,01.
// ---------------------------------------------------------------------
checkoutRouter.post("/create-checkout-session", async (req, res) => {
  if (!stripe) throw new HttpError(503, "Los pagos con tarjeta no están disponibles. Usa WhatsApp.");

  const items = parseItems(req.body);
  const { data: rows, error } = await supabase
    .from("products")
    .select("id, name, flavor, description, price, image_url, is_active")
    .in("id", items.map((i) => i.id));
  if (error) throw new HttpError(502, "No se pudo consultar la base de datos", error.message);

  const byId = new Map(rows.map((r) => [r.id, r]));
  const line_items = items.map(({ id, quantity }) => {
    const product = byId.get(id);
    if (!product || !product.is_active) throw new HttpError(404, `Producto no disponible: ${id}`);
    if (product.price === null || Number(product.price) <= 0) {
      throw new HttpError(409, `"${product.name} (${product.flavor})" no tiene precio: consúltalo por WhatsApp`, {
        whatsapp_url: whatsAppUrl(productWhatsAppMessage(product, quantity)),
      });
    }
    return {
      quantity,
      price_data: {
        currency: config.stripe.currency,
        unit_amount: toStripeAmount(product.price),
        product_data: {
          name: `${product.name} · ${product.flavor}`,
          ...(product.description ? { description: product.description.slice(0, 300) } : {}),
          // Stripe solo acepta imágenes públicas https
          ...(product.image_url?.startsWith("https://") ? { images: [product.image_url] } : {}),
          metadata: { product_id: product.id },
        },
      },
    };
  });

  const customerEmail = typeof req.body.customerEmail === "string" ? req.body.customerEmail.trim() : "";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items,
    // {CHECKOUT_SESSION_ID} lo reemplaza Stripe; sirve para mostrar el pedido en la web
    success_url: `${config.frontendUrl}/pago/exito?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.frontendUrl}/pago/cancelado`,
    locale: "es",
    phone_number_collection: { enabled: true },
    ...(customerEmail ? { customer_email: customerEmail } : {}),
    ...(config.stripe.shippingCountries.length
      ? { shipping_address_collection: { allowed_countries: config.stripe.shippingCountries } }
      : {}),
    // Para identificar el pedido en el webhook / dashboard de Stripe
    metadata: { source: "iqonic-thrive", items: JSON.stringify(items).slice(0, 500) },
  });

  res.status(201).json({ id: session.id, url: session.url });
});

// ---------------------------------------------------------------------
// POST /api/whatsapp-link → alternativa sin pago online
// Body: { "productId": "<uuid o slug>", "quantity": 1 }
// ---------------------------------------------------------------------
checkoutRouter.post("/whatsapp-link", async (req, res) => {
  const product = await findActiveProduct(req.body?.productId ?? req.body?.id);
  const quantity = Number(req.body?.quantity ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
    throw new HttpError(400, `La cantidad debe ser un entero entre 1 y ${MAX_QTY}`);
  }

  const message = productWhatsAppMessage(product, quantity);
  const url = whatsAppUrl(message);
  if (!url) throw new HttpError(503, "WHATSAPP_NUMBER no está configurado en el servidor");
  res.json({ url, message });
});
