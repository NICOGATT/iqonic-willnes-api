/**
 * Punto de entrada: arranca el servidor HTTP.
 *   npm run dev    → con recarga automática (node --watch)
 *   npm start      → producción
 */
import { app } from "./app.js";
import { config } from "./config.js";
import { stripe } from "./lib/stripe.js";

const server = app.listen(config.port, () => {
  console.log(`\n🚀 IQONIC WELLNESS API en http://localhost:${config.port}`);
  console.log(`   Stripe:   ${stripe ? `activo (${config.stripe.currency.toUpperCase()})` : "desactivado (falta STRIPE_SECRET_KEY)"}`);
  console.log(`   WhatsApp: ${config.whatsappNumber ? "activo" : "desactivado (falta WHATSAPP_NUMBER)"}`);
  console.log(`   CORS:     ${config.allowedOrigins.join(", ")}\n`);
});

// Cierre limpio (Ctrl+C, reinicios de la plataforma de hosting)
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
