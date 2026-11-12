import express, { Router } from "express";

import { config } from "../config.js";
import { HttpError } from "../lib/http.js";
import { stripe } from "../lib/stripe.js";

export const webhooksRouter = Router();

/**
 * POST /api/webhooks/stripe
 *
 * Stripe avisa aquí cuando un pago se completa. Es la ÚNICA forma fiable de
 * saber que se cobró (el cliente puede cerrar la pestaña antes de volver a
 * success_url). La firma se verifica con STRIPE_WEBHOOK_SECRET.
 *
 * Necesita el body SIN parsear: por eso usa express.raw y se monta antes
 * de express.json() en app.js.
 */
webhooksRouter.post("/stripe", express.raw({ type: "application/json" }), (req, res) => {
  if (!stripe || !config.stripe.webhookSecret) {
    throw new HttpError(503, "Webhook de Stripe no configurado (STRIPE_WEBHOOK_SECRET)");
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.get("stripe-signature") ?? "", config.stripe.webhookSecret);
  } catch (err) {
    throw new HttpError(400, `Firma de webhook inválida: ${err.message}`);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      // TODO (siguiente paso): guardar el pedido en una tabla `orders` de Supabase
      // y avisar por correo / WhatsApp al equipo.
      console.log(
        `💳 Pago completado · sesión ${session.id} · ${session.amount_total / 100} ${session.currency?.toUpperCase()} · ${session.customer_details?.email ?? "sin email"}`,
      );
      break;
    }
    default:
      // Otros eventos se ignoran, pero se responde 200 para que Stripe no reintente
      break;
  }

  res.json({ received: true });
});
