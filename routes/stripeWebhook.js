const express = require('express');
const router = express.Router();
const stripe = require('../services/stripeClient');
const pool = require('../config/database');

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_MCP || process.env.STRIPE_WEBHOOK_SECRET;

router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } else {
      event = req.body;
      console.warn('[Stripe] WARNING: No webhook secret — skipping signature verification');
    }
  } catch (err) {
    console.error('[Stripe] Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const bookingRef = session.metadata?.booking_ref;
    const paymentIntent = session.payment_intent;

    if (!bookingRef) {
      console.error('[Stripe] Webhook: no booking_ref in metadata');
      return res.json({ received: true });
    }

    console.log(`[Stripe] Payment completed for ${bookingRef}`);

    try {
      await pool.query(
        'UPDATE gia_bookings SET payment_status = ?, stripe_payment_intent = ?, paid_at = NOW() WHERE booking_ref = ?',
        ['paid', paymentIntent, bookingRef]
      );
      console.log(`[Stripe] Marked ${bookingRef} as paid`);
    } catch (err) {
      console.error(`[Stripe] Webhook processing error for ${bookingRef}:`, err.message);
    }
  }

  res.json({ received: true });
});

module.exports = router;
