"use strict";

const Stripe = require("stripe");

function stripeClient(secret) {
  if (!secret) return null;
  return new Stripe(secret);
}

async function createCheckout({ secret, amountCents, playerCode, playerId, successUrl, cancelUrl }) {
  const stripe = stripeClient(secret);
  if (!stripe) throw new Error("Stripe is not configured.");
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { playerCode: playerCode, playerId: playerId || "" },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: amountCents,
        product_data: { name: "PayPiggy account funds", description: "Add funds for " + playerCode }
      }
    }]
  });
  return { url: session.url, id: session.id };
}

/**
 * Verify a Stripe webhook payload and, if it's a completed Checkout Session,
 * return the credit instructions. Idempotency is the caller's job using session id.
 * Returns { ignore: true } for other events, or { error } on bad signature.
 */
function handleWebhook({ payload, signature, webhookSecret }) {
  if (!webhookSecret) return { error: "Stripe webhook secret is not configured.", status: 503 };
  if (!signature) return { error: "Missing Stripe-Signature header.", status: 400 };
  const stripe = stripeClient("sk_test_unused_for_verify");
  let event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    return { error: "Invalid Stripe signature.", status: 400, detail: err.message };
  }
  if (event.type !== "checkout.session.completed") {
    return { ignore: true, eventId: event.id, type: event.type };
  }
  const session = event.data && event.data.object ? event.data.object : {};
  const amount = Math.round(Number(session.amount_total) || 0);
  const code = session.metadata && session.metadata.playerCode;
  const playerId = session.metadata && session.metadata.playerId;
  return {
    ok: true,
    eventId: event.id,
    sessionId: session.id,
    amount,
    code,
    playerId,
    paymentStatus: session.payment_status
  };
}

function generateTestHeader(payload, webhookSecret) {
  const stripe = stripeClient("sk_test_unused_for_verify");
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  return stripe.webhooks.generateTestHeaderString({ payload: body, secret: webhookSecret });
}

module.exports = { createCheckout, handleWebhook, generateTestHeader, stripeClient };
