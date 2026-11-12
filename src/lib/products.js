import { config } from "../config.js";
import { HttpError } from "./http.js";
import { stripe } from "./stripe.js";
import { supabase } from "./supabase.js";
import { productWhatsAppMessage, whatsAppUrl } from "./whatsapp.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const isUuid = (value) => UUID_RE.test(String(value));

/**
 * Fila de Supabase → JSON público.
 * Incluye lo que el frontend necesita para decidir el canal de compra:
 *   - can_checkout: hay precio y Stripe está configurado → botón "Pagar con tarjeta"
 *   - whatsapp_url: enlace listo → botón "Pedir por WhatsApp" (siempre disponible)
 */
export function toPublicProduct(row) {
  const price = row.price === null ? null : Number(row.price);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    type: row.type,
    category: row.category,
    flavor: row.flavor,
    badge: row.badge,
    presentation: { label: row.presentation_label, detail: row.presentation_detail },
    benefits: Array.isArray(row.benefits) ? row.benefits : [],
    price,
    currency: config.stripe.currency,
    image_url: row.image_url,
    accent: { from: row.accent_from, to: row.accent_to },
    featured: row.featured,
    is_active: row.is_active,
    can_checkout: Boolean(stripe) && price !== null && price > 0,
    whatsapp_url: whatsAppUrl(productWhatsAppMessage(row)),
  };
}

/** Busca un producto activo por UUID o por slug. Lanza 404 si no existe. */
export async function findActiveProduct(idOrSlug) {
  const key = String(idOrSlug ?? "").trim();
  if (!isUuid(key) && !SLUG_RE.test(key)) throw new HttpError(400, "Identificador de producto inválido");

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq(isUuid(key) ? "id" : "slug", key)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new HttpError(502, "No se pudo consultar la base de datos", error.message);
  if (!data) throw new HttpError(404, "Producto no encontrado");
  return data;
}
