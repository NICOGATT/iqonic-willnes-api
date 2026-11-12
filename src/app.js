import cors from "cors";
import express from "express";

import { config } from "./config.js";
import { stripe } from "./lib/stripe.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { checkoutRouter } from "./routes/checkout.js";
import { productsRouter } from "./routes/products.js";
import { webhooksRouter } from "./routes/webhooks.js";

/**
 * Aplicación Express (separada de server.js para poder testearla sin abrir un puerto).
 */
export const app = express();

app.disable("x-powered-by");

// CORS: solo las webs de ALLOWED_ORIGINS pueden llamar desde el navegador.
// Peticiones sin Origin (cURL, Postman, servidor a servidor) se permiten.
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
      callback(null, false);
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
  }),
);

// El webhook necesita el body crudo: se monta ANTES de express.json()
app.use("/api/webhooks", webhooksRouter);

app.use(express.json({ limit: "100kb" }));

// Estado del servicio (útil para comprobar que está vivo)
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    stripe: Boolean(stripe),
    whatsapp: Boolean(config.whatsappNumber),
    time: new Date().toISOString(),
  });
});

app.use("/api/products", productsRouter);
app.use("/api", checkoutRouter);

app.use(notFound);
app.use(errorHandler);
