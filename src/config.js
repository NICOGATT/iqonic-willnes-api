/**
 * Configuración centralizada.
 * Lee .env una sola vez, valida lo obligatorio y expone valores tipados.
 * Si falta algo crítico, el servidor no arranca y lo dice claramente.
 */
import "dotenv/config";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`\n❌ Falta la variable de entorno ${name}. Revisa tu archivo .env (ver .env.example).\n`);
    process.exit(1);
  }
  return value;
}

const optional = (name, fallback = "") => process.env[name]?.trim() || fallback;

export const config = {
  port: Number(optional("PORT", "4000")),
  isProduction: optional("NODE_ENV") === "production",

  /** Orígenes que pueden llamar a la API desde el navegador (CORS). */
  allowedOrigins: optional("ALLOWED_ORIGINS", "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  supabase: {
    url: required("SUPABASE_URL"),
    // Clave SECRETA (service_role / sb_secret_...). Solo en el servidor:
    // salta RLS, por eso esta API valida todo antes de escribir.
    serviceKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  },

  stripe: {
    secretKey: optional("STRIPE_SECRET_KEY"),
    webhookSecret: optional("STRIPE_WEBHOOK_SECRET"),
    currency: optional("STRIPE_CURRENCY", "usd").toLowerCase(),
    /** Países a los que envías (ej. "US,MX,CO"). Vacío = no pedir dirección. */
    shippingCountries: optional("STRIPE_SHIPPING_COUNTRIES")
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean),
  },

  /** Clave que debe enviar quien crea productos (cabecera x-api-key). */
  adminApiKey: required("ADMIN_API_KEY"),

  /** Web pública: Stripe vuelve aquí tras pagar o cancelar. */
  frontendUrl: optional("FRONTEND_URL", "http://localhost:3000").replace(/\/$/, ""),

  whatsappNumber: optional("WHATSAPP_NUMBER").replace(/\D/g, ""),
};

if (config.adminApiKey.length < 24) {
  console.error("\n❌ ADMIN_API_KEY es demasiado corta (mínimo 24 caracteres). Genera una con:");
  console.error('   node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n');
  process.exit(1);
}
