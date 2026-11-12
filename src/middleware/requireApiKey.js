import { createHash, timingSafeEqual } from "node:crypto";

import { config } from "../config.js";
import { HttpError } from "../lib/http.js";

const digest = (value) => createHash("sha256").update(value).digest();
const expected = digest(config.adminApiKey);

/**
 * Protege rutas de administración.
 * Acepta la clave en `x-api-key: <clave>` o `Authorization: Bearer <clave>`.
 * La comparación es de tiempo constante para no filtrar pistas por timing.
 */
export function requireApiKey(req, _res, next) {
  const header = req.get("x-api-key") ?? req.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!header || !timingSafeEqual(digest(header), expected)) {
    throw new HttpError(401, "API key inválida o ausente");
  }
  next();
}
