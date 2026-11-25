import { json, handleOptions, stripeGet, verifyStripeWebhook } from "../_shared/jwt.js";
import { canonicalCustomerId } from "../_shared/customers.js";
import { refundCreditsDelta } from "../_shared/billing-math.js";

const PACK_CREDITS = {
  starter: 5_000,
  value:   10_000,
  pro:     15_000,
};

export function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost({ request, env }) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET not configured");
    return json({ error: "Webhook secret not configured" }, 500);
  }
  if (!env.STRIPE_SECRET_KEY) return json({ error: "STRIPE_SECRET_KEY not configured" }, 500);
  if (!env.DB)                return json({ error: "D1 not bound" }, 500);

  const rawBody = await request.text();
  const sigHdr  = request.headers.get("Stripe-Signature");

  try {
    await verifyStripeWebhook(rawBody, sigHdr, env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    console.error("[webhook] Signature verification failed:", e.message);
    return json({ error: "Invalid signature" }, 400);
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (event.id) {
    try {
      const dedup = await env.DB.prepare(
        "INSERT OR IGNORE INTO webhook_events (event_id, event_type, received_at) VALUES (?, ?, unixepoch())"
      ).bind(event.id, event.type || "unknown").run();
      if (dedup.meta?.changes === 0) {
        console.log("[webhook] Duplicate event.id, ignored:", event.id);
        return json({ received: true, note: "duplicate event" });
      }
    } catch (e) {
      console.warn("[webhook] event dedup table missing or query failed:", e.message);
    }
  }

  let res;
  try {
    res = await dispatch(event, env);
  } catch (e) {
    console.error("[webhook] handler threw:", e.message);
    res = json({ error: "Internal error" }, 500);
  }

  if (res.status >= 500 && event.id) {
    await env.DB.prepare("DELETE FROM webhook_events WHERE event_id = ?").bind(event.id).run()
      .catch(e => console.warn("[webhook] could not clear dedup row:", e.message));
  }
  return res;
}

function dispatch(event, env) {
  switch (event.type) {
    case "checkout.session.completed":
      return handleCheckoutCompleted(event, env);
    case "charge.refunded":
      return handleChargeRefunded(event, env);
    case "charge.dispute.created":
      return handleDisputeCreated(event, env);
    case "charge.dispute.closed":
      return handleDisputeClosed(event, env);
    default:
      return json({ received: true });
  }
}

async function handleCheckoutCompleted(event, env) {
  const sessionId = event.data?.object?.id;
  if (!sessionId) return json({ error: "No session ID in event" }, 400);

  let session;
  try {
    session = await stripeGet(env.STRIPE_SECRET_KEY, `/checkout/sessions/${sessionId}`);
  } catch (e) {
    console.error("[webhook] Stripe session lookup failed:", e.message);
    return json({ error: "Stripe verification failed" }, 500);
  }

  if (session.payment_status !== "paid") {
    return json({ received: true, note: "payment_status not paid" });
  }

  const email      = session.customer_details?.email ?? session.customer_email ?? null;
  const customerId = await canonicalCustomerId(env.DB, session.customer, email);
  const packId     = session.metadata?.packId;
  const credits    = PACK_CREDITS[packId] ?? 0;

  if (!customerId) {
    console.error("[webhook] No customer on session:", sessionId);
    return json({ received: true, note: "no customer" });
  }
  if (packId === "report") {
    try {
      const existing = await env.DB.prepare(
        "SELECT id FROM credit_transactions WHERE stripe_session_id = ? AND type = 'report_purchase'"
      ).bind(sessionId).first();
      if (existing) return json({ received: true, note: "report already granted" });

      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO customers (stripe_customer_id, email, credits)
          VALUES (?, ?, 0)
          ON CONFLICT(stripe_customer_id) DO UPDATE SET
            email      = COALESCE(excluded.email, email),
            updated_at = unixepoch()
        `).bind(customerId, email),
        env.DB.prepare(`
          INSERT INTO credit_transactions (customer_id, type, amount, stripe_session_id)
          VALUES (?, 'report_purchase', 0, ?)
        `).bind(customerId, sessionId),
      ]);
      console.log(`[webhook] Report purchased by ${customerId}`);
    } catch (e) {
      console.error("[webhook] report grant failed:", e.message);
      return json({ error: "Database error" }, 500);
    }
    return json({ received: true });
  }

  if (credits === 0) {
    console.error("[webhook] Unknown packId:", packId);
    return json({ received: true, note: "unknown pack" });
  }

  try {
    const existing = await env.DB.prepare(
      "SELECT id FROM credit_transactions WHERE stripe_session_id = ? AND type = 'purchase'"
    ).bind(sessionId).first();
    if (existing) {
      console.log("[webhook] Already processed:", sessionId);
      return json({ received: true });
    }
  } catch (e) {
    console.error("[webhook] Idempotency check failed:", e.message);
  }

  try {
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO customers (stripe_customer_id, email, credits)
        VALUES (?, ?, ?)
        ON CONFLICT(stripe_customer_id) DO UPDATE SET
          email      = COALESCE(excluded.email, email),
          credits    = credits + excluded.credits,
          updated_at = unixepoch()
      `).bind(customerId, email, credits),
      env.DB.prepare(`
        INSERT INTO credit_transactions (customer_id, type, amount, stripe_session_id)
        VALUES (?, 'purchase', ?, ?)
      `).bind(customerId, credits, sessionId),
    ]);
    console.log(`[webhook] Credited ${credits} to ${customerId} (pack: ${packId})`);
  } catch (e) {
    console.error("[webhook] D1 write failed:", e.message);
    return json({ error: "Database error" }, 500);
  }

  return json({ received: true });
}

async function handleChargeRefunded(event, env) {
  const charge     = event.data?.object;
  const customerId = await canonicalCustomerId(env.DB, charge?.customer);

  if (!customerId) {
    console.error("[webhook] charge.refunded: no customer on charge");
    return json({ received: true, note: "no customer" });
  }

  if (await alreadyProcessed(env, event.id, "refund")) {
    return json({ received: true, note: "duplicate refund event" });
  }

  const deltaCents      = (charge.amount_refunded ?? 0) - (event.data?.previous_attributes?.amount_refunded ?? 0);
  const creditsToDeduct = refundCreditsDelta(
    charge.amount_refunded,
    event.data?.previous_attributes?.amount_refunded
  );

  if (creditsToDeduct <= 0) {
    console.log("[webhook] charge.refunded: no new credit delta, skipping");
    return json({ received: true, note: "no delta" });
  }

  try {
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE customers
        SET credits = MAX(0, credits - ?), updated_at = unixepoch()
        WHERE stripe_customer_id = ?
      `).bind(creditsToDeduct, customerId),
      env.DB.prepare(`
        INSERT INTO credit_transactions (customer_id, type, amount, stripe_session_id)
        VALUES (?, 'refund', ?, ?)
      `).bind(customerId, -creditsToDeduct, event.id ?? null),
    ]);
    console.log(`[webhook] Refund: deducted ${creditsToDeduct} credits from ${customerId} ($${(deltaCents / 100).toFixed(2)} refunded)`);
  } catch (e) {
    console.error("[webhook] charge.refunded D1 write failed:", e.message);
    return json({ error: "Database error" }, 500);
  }

  return json({ received: true });
}

async function alreadyProcessed(env, eventId, type) {
  if (!eventId) return false;
  try {
    const row = await env.DB.prepare(
      "SELECT id FROM credit_transactions WHERE stripe_session_id = ? AND type = ?"
    ).bind(eventId, type).first();
    return !!row;
  } catch (e) {
    console.warn("[webhook] idempotency pre-check failed:", e.message);
    return false;
  }
}

async function handleDisputeCreated(event, env) {
  const dispute  = event.data?.object;
  const chargeId = dispute?.charge;

  if (!chargeId) {
    console.error("[webhook] charge.dispute.created: no charge ID on dispute");
    return json({ received: true, note: "no charge" });
  }

  let charge;
  try {
    charge = await stripeGet(env.STRIPE_SECRET_KEY, `/charges/${chargeId}`);
  } catch (e) {
    console.error("[webhook] charge.dispute.created: charge lookup failed:", e.message);
    return json({ error: "Charge lookup failed" }, 500);
  }

  const customerId = await canonicalCustomerId(env.DB, charge.customer);
  if (!customerId) {
    console.error("[webhook] charge.dispute.created: no customer on charge", chargeId);
    return json({ received: true, note: "no customer on charge" });
  }

  if (await alreadyProcessed(env, event.id, "dispute_lock")) {
    return json({ received: true, note: "duplicate dispute event" });
  }

  try {
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE customers
        SET status = 'disputed', updated_at = unixepoch()
        WHERE stripe_customer_id = ?
      `).bind(customerId),
      env.DB.prepare(`
        INSERT INTO credit_transactions (customer_id, type, amount, stripe_session_id)
        VALUES (?, 'dispute_lock', 0, ?)
      `).bind(customerId, event.id ?? null),
    ]);
    console.log(`[webhook] Dispute lock: suspended customer ${customerId} (charge: ${chargeId})`);
  } catch (e) {
    console.error("[webhook] charge.dispute.created D1 write failed:", e.message);
    return json({ error: "Database error" }, 500);
  }

  return json({ received: true });
}

async function handleDisputeClosed(event, env) {
  const dispute  = event.data?.object;
  const chargeId = dispute?.charge;
  const status   = dispute?.status;

  if (status !== "won") {
    return json({ received: true, note: `dispute closed as '${status}' — lock unchanged` });
  }
  if (!chargeId) {
    console.error("[webhook] charge.dispute.closed: no charge ID on dispute");
    return json({ received: true, note: "no charge" });
  }

  let charge;
  try {
    charge = await stripeGet(env.STRIPE_SECRET_KEY, `/charges/${chargeId}`);
  } catch (e) {
    console.error("[webhook] charge.dispute.closed: charge lookup failed:", e.message);
    return json({ error: "Charge lookup failed" }, 500);
  }

  const customerId = await canonicalCustomerId(env.DB, charge.customer);
  if (!customerId) {
    return json({ received: true, note: "no customer on charge" });
  }

  if (await alreadyProcessed(env, event.id, "dispute_release")) {
    return json({ received: true, note: "duplicate dispute-closed event" });
  }

  try {
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE customers
        SET status = 'active', updated_at = unixepoch()
        WHERE stripe_customer_id = ? AND status = 'disputed'
      `).bind(customerId),
      env.DB.prepare(`
        INSERT INTO credit_transactions (customer_id, type, amount, stripe_session_id)
        VALUES (?, 'dispute_release', 0, ?)
      `).bind(customerId, event.id ?? null),
    ]);
    console.log(`[webhook] Dispute won: reactivated customer ${customerId} (charge: ${chargeId})`);
  } catch (e) {
    console.error("[webhook] charge.dispute.closed D1 write failed:", e.message);
    return json({ error: "Database error" }, 500);
  }

  return json({ received: true });
}
