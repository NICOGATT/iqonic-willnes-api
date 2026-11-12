import { createClient } from "@supabase/supabase-js";

import { config } from "../config.js";

/**
 * Cliente de Supabase con la clave de servicio (solo servidor).
 * Usa la misma tabla `products` que la web en Next.js
 * (iqonic-thrive/supabase/migrations/0001_products.sql).
 */
export const supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
