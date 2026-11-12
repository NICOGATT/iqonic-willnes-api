/**
 * Error con código HTTP. Lánzalo desde cualquier ruta y el manejador
 * global (middleware/errors.js) responde { error, details } con ese código.
 */
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
