import Stripe from "stripe";

import { config } from "../config.js";

/**
 * Cliente de Stripe. Si no hay STRIPE_SECRET_KEY, la API sigue funcionando
 * (productos + WhatsApp) y el checkout responde 503 "pagos no disponibles".
 */
export const stripe = config.stripe.secretKey ? new Stripe(config.stripe.secretKey) : null;

/**
 * Monedas sin decimales en Stripe: el importe va en unidades, no en centavos.
 * https://docs.stripe.com/currencies#zero-decimal
 */
const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

/** 29.90 USD → 2990 (centavos). 15000 CLP → 15000. */
export function toStripeAmount(price, currency = config.stripe.currency) {
  const factor = ZERO_DECIMAL.has(currency) ? 1 : 100;
  return Math.round(Number(price) * factor);
}
