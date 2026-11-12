import { config } from "../config.js";
import { HttpError } from "../lib/http.js";

/** 404 para rutas que no existen. */
export function notFound(req, _res, next) {
  next(new HttpError(404, `Ruta no encontrada: ${req.method} ${req.path}`));
}

/**
 * Manejador global de errores (Express 5 captura también los de funciones async).
 * Nunca envía detalles internos en producción.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  // JSON mal formado en el body
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "El body no es un JSON válido" });
  }

  const status = err instanceof HttpError ? err.status : 500;
  if (status >= 500) console.error("[error]", err);

  res.status(status).json({
    error: status >= 500 && config.isProduction ? "Error interno del servidor" : err.message,
    ...(err.details ? { details: err.details } : {}),
  });
}
