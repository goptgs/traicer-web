import {
  asBillingStatus,
  emptyFreeSnapshot,
  isPlanId,
  isUuid,
  normalizeStripeEvent,
  priceCatalog,
  reduceBillingEvent,
  verifyStripeSignature,
  type BillingInterval,
  type BillingSnapshot,
  type PlanId,
} from "../_shared/billing.ts";
import {
  claimStripeEvent,
  completeStripeEvent,
  findEntitlement,
  insertEntitlement,
  serviceEnv,
  updateEntitlement,
} from "../_shared/admin.ts";
import { envValue, json } from "../_shared/http.ts";
import { readPriceEnv } from "../_shared/stripe.ts";

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function intervalOf(value: unknown): BillingInterval | null {
  return value === "month" || value === "year" ? value : null;
}

function planOf(value: unknown): PlanId | null {
  return typeof value === "string" && isPlanId(value) ? value : null;
}

function snapshotFromRow(row: Record<string, unknown>): BillingSnapshot {
  const plan = planOf(row.plan) ?? "free";
  return {
    plan,
    status: asBillingStatus(row.status),
    stripeCustomerId: text(row.stripe_customer_id),
    stripeSubscriptionId: text(row.stripe_subscription_id),
    stripePriceId: text(row.stripe_price_id),
    billingInterval: intervalOf(row.billing_interval),
    currentPeriodStart: text(row.current_period_start),
    currentPeriodEnd: text(row.current_period_end),
    cancelAtPeriodEnd: row.cancel_at_period_end === true,
    quotaLimit: typeof row.quota_limit === "number" ? row.quota_limit : 5,
    exportsUsed: typeof row.exports_used === "number" ? row.exports_used : 0,
    pendingPlan: planOf(row.pending_plan),
    pendingPriceId: text(row.pending_price_id),
    pendingQuotaLimit: typeof row.pending_quota_limit === "number" ? row.pending_quota_limit : null,
    pendingInterval: intervalOf(row.pending_interval),
    usagePeriodStart: text(row.usage_period_start),
  };
}

function patchFromSnapshot(snapshot: BillingSnapshot): Record<string, unknown> {
  return {
    plan: snapshot.plan,
    status: snapshot.status,
    stripe_customer_id: snapshot.stripeCustomerId,
    stripe_subscription_id: snapshot.stripeSubscriptionId,
    stripe_price_id: snapshot.stripePriceId,
    billing_interval: snapshot.billingInterval,
    current_period_start: snapshot.currentPeriodStart,
    current_period_end: snapshot.currentPeriodEnd,
    cancel_at_period_end: snapshot.cancelAtPeriodEnd,
    quota_limit: snapshot.quotaLimit,
    exports_used: snapshot.exportsUsed,
    pending_plan: snapshot.pendingPlan,
    pending_price_id: snapshot.pendingPriceId,
    pending_quota_limit: snapshot.pendingQuotaLimit,
    pending_interval: snapshot.pendingInterval,
    usage_period_start: snapshot.usagePeriodStart,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!serviceEnv()) return json({ error: "billing_unavailable" }, 503);

  const secret = envValue("STRIPE_WEBHOOK_SECRET");
  if (!secret) return json({ error: "billing_unavailable" }, 503);

  const payload = await req.text();
  const verified = await verifyStripeSignature(
    payload,
    req.headers.get("stripe-signature"),
    secret,
    Math.floor(Date.now() / 1000),
  );
  if (!verified.ok) return json({ error: verified.reason }, 400);

  let event: { id?: unknown; type?: unknown; data?: unknown };
  try {
    event = JSON.parse(payload);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const eventId = typeof event.id === "string" ? event.id : "";
  const eventType = typeof event.type === "string" ? event.type : "";
  if (!eventId || !eventType) return json({ error: "invalid_event" }, 400);

  let claimed: "claimed" | "duplicate" | "pending";
  try {
    claimed = await claimStripeEvent(eventId, eventType);
  } catch (error) {
    console.error("claim_failed", eventId, error instanceof Error ? error.message : "failed");
    return json({ error: "claim_failed" }, 500);
  }
  if (claimed === "duplicate") return json({ received: true, duplicate: true });
  if (claimed === "pending") return json({ error: "retry" }, 500);

  try {
    await applyEvent(event);
    await completeStripeEvent(eventId);
  } catch (error) {
    console.error("webhook_failed", eventId, eventType, error instanceof Error ? error.message : "failed");
    return json({ error: "retry" }, 500);
  }

  return json({ received: true });
});

async function applyEvent(event: { type?: unknown; data?: unknown }): Promise<void> {
  const normalized = normalizeStripeEvent(event);
  if (normalized.type === "ignored") return;

  const userId =
    normalized.type === "checkout_completed" || normalized.type === "subscription_upsert"
      ? normalized.userId
      : null;
  const customerId = "customerId" in normalized ? normalized.customerId : null;
  const subscriptionId = "subscriptionId" in normalized ? normalized.subscriptionId : null;

  if (userId && !isUuid(userId)) throw new Error("bad_user");

  let row = await findEntitlement({
    userId,
    customerId,
    subscriptionId,
  });

  if (!row && userId) {
    const fresh = emptyFreeSnapshot(new Date());
    await insertEntitlement({
      user_id: userId,
      ...patchFromSnapshot(fresh),
    });
    row = await findEntitlement({ userId });
  }

  if (!row || typeof row.user_id !== "string") {
    throw new Error("entitlement_missing");
  }

  const now = new Date();
  const reduced = reduceBillingEvent(snapshotFromRow(row), normalized, priceCatalog(readPriceEnv()), now);
  if (reduced.retry) throw new Error("retry");

  const updatedAt = typeof row.updated_at === "string" ? row.updated_at : "";
  const wrote = await updateEntitlement(row.user_id, updatedAt, patchFromSnapshot(reduced.snapshot));
  if (!wrote) throw new Error("conflict");
}
