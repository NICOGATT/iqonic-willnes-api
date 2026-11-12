import { config } from "../config.js";

/**
 * Mismo formato de mensaje que usa la web:
 * "Hola, quiero consultar por el producto: IGNITE (Amazon Punch)"
 */
export function productWhatsAppMessage(product, quantity = 1) {
  const qty = quantity > 1 ? ` x${quantity}` : "";
  return `Hola, quiero consultar por el producto: ${product.name} (${product.flavor})${qty}`;
}

/** Enlace wa.me con el texto codificado; null si no hay número configurado. */
export function whatsAppUrl(message) {
  if (!config.whatsappNumber) return null;
  return `https://wa.me/${config.whatsappNumber}?text=${encodeURIComponent(message)}`;
}
