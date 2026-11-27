/**
 * Pure billing rules shared by the Stripe webhook and the node tests.
 * Quota numbers come from src/config/pricing.ts. The SQL function
 * public.consume_export enforces the same allow/deny reasons.
 */
import {
  FREE_QUOTA,
  STRIPE_PRICE_ENV,
  isPaidPlanId,
  periodQuota,
  pricingTiers,
  type BillingInterval,
  type PaidPlanId,
  type PlanId,
} from "../../../src/config/pricing.ts";

export { FREE_QUOTA, isPaidPlanId, isPlanId, periodQuota };
export type { BillingInterval, PaidPlanId, PlanId };

export const BILLING_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "paused",
] as const;

export type BillingStatus = (typeof BILLING_STATUSES)[number];

export type PriceCatalogEntry = {
  priceId: string;
  plan: PaidPlanId;
  interval: BillingInterval;
  /** Monthly render cap. Annual prices use this same cap. */
  quota: number;
};

export type BillingSnapshot = {
  plan: PlanId;
  status: BillingStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  billingInterval: BillingInterval | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  quotaLimit: number;
  exportsUsed: number;
  pendingPlan: PlanId | null;
  pendingPriceId: string | null;
  pendingQuotaLimit: number | null;
  pendingInterval: BillingInterval | null;
  /** Start of the quota window. Free and annual plans use the UTC calendar month. */
  usagePeriodStart: string | null;
};

export type EnvSource = Record<string, string | undefined>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export function planRank(plan: PlanId): number {
  switch (plan) {
    case "free":
      return 0;
    case "pro":
      return 1;
    case "studio":
      return 2;
  }
}

export function priceCatalog(env: EnvSource): PriceCatalogEntry[] {
  const entries: PriceCatalogEntry[] = [];
  for (const tier of pricingTiers) {
    if (!isPaidPlanId(tier.id)) continue;
    const names = STRIPE_PRICE_ENV[tier.id];
    for (const interval of ["month", "year"] as const) {
      const priceId = env[names[interval]]?.trim() ?? "";
      if (!priceId) continue;
      entries.push({
        priceId,
        plan: tier.id,
        interval,
        quota: periodQuota(tier.id, interval),
      });
    }
  }
  return entries;
}

export function lookupPrice(catalog: readonly PriceCatalogEntry[], priceId: string | null): PriceCatalogEntry | null {
  if (!priceId) return null;
  return catalog.find((entry) => entry.priceId === priceId) ?? null;
}

export function utcMonthWindow(now: Date): { start: string; end: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { start: start.toISOString(), end: end.toISOString() };
}

export function emptyFreeSnapshot(now: Date): BillingSnapshot {
  const window = utcMonthWindow(now);
  return {
    plan: "free",
    status: "active",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    billingInterval: null,
    currentPeriodStart: window.start,
    currentPeriodEnd: window.end,
    cancelAtPeriodEnd: false,
    quotaLimit: FREE_QUOTA,
    exportsUsed: 0,
    pendingPlan: null,
    pendingPriceId: null,
    pendingQuotaLimit: null,
    pendingInterval: null,
    usagePeriodStart: window.start,
  };
}

function clearPending(snapshot: BillingSnapshot): BillingSnapshot {
  return {
    ...snapshot,
    pendingPlan: null,
    pendingPriceId: null,
    pendingQuotaLimit: null,
    pendingInterval: null,
  };
}

export function toFreeSnapshot(snapshot: BillingSnapshot, now: Date): BillingSnapshot {
  const window = utcMonthWindow(now);
  return clearPending({
    ...snapshot,
    plan: "free",
    status: "active",
    stripeSubscriptionId: null,
    stripePriceId: null,
    billingInterval: null,
    currentPeriodStart: window.start,
    currentPeriodEnd: window.end,
    cancelAtPeriodEnd: false,
    quotaLimit: FREE_QUOTA,
  });
}

export type ConsumeReason = "quota" | "past_due" | "billing";

export type ConsumeDecision = {
  snapshot: BillingSnapshot;
  decision: { allowed: true } | { allowed: false; reason: ConsumeReason };
};

function monthRolled(usagePeriodStart: string | null, monthStartIso: string): boolean {
  if (!usagePeriodStart) return true;
  const start = Date.parse(usagePeriodStart);
  return !Number.isFinite(start) || start < Date.parse(monthStartIso);
}

/**
 * Mirror of public.consume_export, without the row lock.
 * Free plans and annual plans reset on the UTC calendar month.
 * Monthly plans reset only when invoice.paid has billing_reason
 * subscription_cycle. A pending downgrade applies once
 * current_period_end has passed.
 */
export function decideConsume(snapshot: BillingSnapshot, now: Date): ConsumeDecision {
  let next: BillingSnapshot = { ...snapshot };

  if (
    next.pendingPlan &&
    next.pendingQuotaLimit != null &&
    next.currentPeriodEnd &&
    Date.parse(next.currentPeriodEnd) <= now.getTime()
  ) {
    next = {
      ...next,
      plan: next.pendingPlan,
      stripePriceId: next.pendingPriceId,
      quotaLimit: next.pendingQuotaLimit,
      billingInterval: next.pendingInterval,
      pendingPlan: null,
      pendingPriceId: null,
      pendingQuotaLimit: null,
      pendingInterval: null,
    };
  }

  const calendarReset = next.plan === "free" || next.billingInterval === "year";
  if (calendarReset) {
    const window = utcMonthWindow(now);
    if (monthRolled(next.usagePeriodStart, window.start)) {
      next = {
        ...next,
        exportsUsed: 0,
        usagePeriodStart: window.start,
        ...(next.plan === "free"
          ? {
              currentPeriodStart: window.start,
              currentPeriodEnd: window.end,
              status: "active" as const,
              quotaLimit: FREE_QUOTA,
            }
          : {}),
      };
    }
  }

  if (next.status === "past_due") {
    return { snapshot: next, decision: { allowed: false, reason: "past_due" } };
  }
  if (next.status !== "active" && next.status !== "trialing") {
    return { snapshot: next, decision: { allowed: false, reason: "billing" } };
  }
  if (next.exportsUsed >= next.quotaLimit) {
    return { snapshot: next, decision: { allowed: false, reason: "quota" } };
  }

  next = { ...next, exportsUsed: next.exportsUsed + 1 };
  return { snapshot: next, decision: { allowed: true } };
}

type IncomingPlan = {
  priceId: string;
  plan: PaidPlanId;
  interval: BillingInterval;
  quota: number;
  status: BillingStatus;
  periodStart: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  customerId: string | null;
  subscriptionId: string | null;
};

function applyIncoming(snapshot: BillingSnapshot, incoming: IncomingPlan, pending: boolean): BillingSnapshot {
  const base: BillingSnapshot = {
    ...snapshot,
    status: incoming.status,
    stripeCustomerId: incoming.customerId ?? snapshot.stripeCustomerId,
    stripeSubscriptionId: incoming.subscriptionId ?? snapshot.stripeSubscriptionId,
    currentPeriodStart: incoming.periodStart ?? snapshot.currentPeriodStart,
    currentPeriodEnd: incoming.periodEnd ?? snapshot.currentPeriodEnd,
    cancelAtPeriodEnd: incoming.cancelAtPeriodEnd,
  };

  if (pending) {
    return {
      ...base,
      pendingPlan: incoming.plan,
      pendingPriceId: incoming.priceId,
      pendingQuotaLimit: incoming.quota,
      pendingInterval: incoming.interval,
    };
  }

  return clearPending({
    ...base,
    plan: incoming.plan,
    stripePriceId: incoming.priceId,
    quotaLimit: incoming.quota,
    billingInterval: incoming.interval,
  });
}

/**
 * Upgrades apply immediately and do not change exports_used.
 * Downgrades, and annual → monthly on the same tier, wait until the
 * period ends. A new Stripe period applies the incoming price
 * immediately. Monthly usage resets on invoice.paid when
 * billing_reason is subscription_cycle. Annual usage keeps the same
 * monthly cap and resets on the UTC calendar month instead.
 */
export function transitionPlan(
  snapshot: BillingSnapshot,
  incoming: IncomingPlan,
  mode: "mid_period" | "renewal",
): BillingSnapshot {
  if (mode === "renewal") {
    return applyIncoming(snapshot, incoming, false);
  }

  const higher = planRank(incoming.plan) > planRank(snapshot.plan);
  const lower = planRank(incoming.plan) < planRank(snapshot.plan);
  const same = planRank(incoming.plan) === planRank(snapshot.plan);
  const monthToYear = same && snapshot.billingInterval === "month" && incoming.interval === "year";
  const yearToMonth = same && snapshot.billingInterval === "year" && incoming.interval === "month";

  if (higher || monthToYear || (same && !yearToMonth)) {
    return applyIncoming(snapshot, incoming, false);
  }
  return applyIncoming(snapshot, incoming, true);
}

export function eventMatchesSubscription(snapshot: BillingSnapshot, subscriptionId: string | null): boolean {
  if (!subscriptionId) return true;
  if (snapshot.stripeSubscriptionId) return snapshot.stripeSubscriptionId === subscriptionId;
  return snapshot.plan !== "free";
}

export type NormalizedEvent =
  | {
      type: "checkout_completed";
      userId: string | null;
      customerId: string | null;
      subscriptionId: string | null;
    }
  | {
      type: "subscription_upsert";
      userId: string | null;
      customerId: string | null;
      subscriptionId: string;
      priceId: string | null;
      status: BillingStatus;
      periodStart: string | null;
      periodEnd: string | null;
      cancelAtPeriodEnd: boolean;
    }
  | {
      type: "subscription_deleted";
      customerId: string | null;
      subscriptionId: string | null;
    }
  | {
      type: "invoice_paid";
      billingReason: string | null;
      customerId: string | null;
      subscriptionId: string | null;
      priceId: string | null;
      periodStart: string | null;
      periodEnd: string | null;
    }
  | {
      type: "invoice_payment_failed";
      customerId: string | null;
      subscriptionId: string | null;
    }
  | { type: "ignored" };

export type ReduceResult = {
  snapshot: BillingSnapshot;
  /** Ask Stripe to retry. Used when the price id or the user is not known yet. */
  retry: boolean;
};

function statusAfterPayment(status: BillingStatus): BillingStatus {
  if (status === "past_due" || status === "incomplete" || status === "unpaid") return "active";
  return status;
}

function isRenewal(snapshot: BillingSnapshot, periodStart: string | null): boolean {
  if (!snapshot.currentPeriodStart || !periodStart) return false;
  const previous = Date.parse(snapshot.currentPeriodStart);
  const next = Date.parse(periodStart);
  return Number.isFinite(previous) && Number.isFinite(next) && next > previous;
}

export function reduceBillingEvent(
  snapshot: BillingSnapshot,
  event: NormalizedEvent,
  catalog: readonly PriceCatalogEntry[],
  now: Date,
): ReduceResult {
  if (event.type === "ignored") return { snapshot, retry: false };

  if (event.type === "checkout_completed") {
    if (!event.userId) return { snapshot, retry: true };
    return {
      snapshot: {
        ...snapshot,
        stripeCustomerId: event.customerId ?? snapshot.stripeCustomerId,
        stripeSubscriptionId: event.subscriptionId ?? snapshot.stripeSubscriptionId,
      },
      retry: false,
    };
  }

  if (event.type === "subscription_deleted") {
    if (
      event.subscriptionId &&
      snapshot.stripeSubscriptionId &&
      event.subscriptionId !== snapshot.stripeSubscriptionId
    ) {
      return { snapshot, retry: false };
    }
    if (event.subscriptionId && !snapshot.stripeSubscriptionId && snapshot.plan === "free") {
      return { snapshot, retry: false };
    }
    return { snapshot: toFreeSnapshot(snapshot, now), retry: false };
  }

  if (event.type === "invoice_payment_failed") {
    if (!eventMatchesSubscription(snapshot, event.subscriptionId)) {
      return { snapshot, retry: false };
    }
    return { snapshot: { ...snapshot, status: "past_due" }, retry: false };
  }

  if (event.type === "subscription_upsert") {
    const price = lookupPrice(catalog, event.priceId);
    if (!price) return { snapshot, retry: true };
    const incoming: IncomingPlan = {
      priceId: price.priceId,
      plan: price.plan,
      interval: price.interval,
      quota: price.quota,
      status: event.status,
      periodStart: event.periodStart,
      periodEnd: event.periodEnd,
      cancelAtPeriodEnd: event.cancelAtPeriodEnd,
      customerId: event.customerId,
      subscriptionId: event.subscriptionId,
    };
    const mode = isRenewal(snapshot, event.periodStart) ? "renewal" : "mid_period";
    return { snapshot: stampUsageWindow(transitionPlan(snapshot, incoming, mode), now), retry: false };
  }

  if (!eventMatchesSubscription(snapshot, event.subscriptionId)) {
    return { snapshot, retry: false };
  }

  const cycle = event.billingReason === "subscription_cycle";
  let next: BillingSnapshot = { ...snapshot, status: statusAfterPayment(snapshot.status) };
  const price = lookupPrice(catalog, event.priceId);

  if (cycle && price) {
    next = transitionPlan(
      next,
      {
        priceId: price.priceId,
        plan: price.plan,
        interval: price.interval,
        quota: price.quota,
        status: next.status,
        periodStart: event.periodStart,
        periodEnd: event.periodEnd,
        cancelAtPeriodEnd: next.cancelAtPeriodEnd,
        customerId: event.customerId,
        subscriptionId: event.subscriptionId,
      },
      "renewal",
    );
    if (price.interval === "month") next = { ...next, exportsUsed: 0 };
    return { snapshot: stampUsageWindow(next, now), retry: false };
  }

  if (cycle && next.pendingPlan && next.pendingQuotaLimit != null) {
    const pendingInterval = next.pendingInterval;
    next = clearPending({
      ...next,
      plan: next.pendingPlan,
      stripePriceId: next.pendingPriceId,
      quotaLimit: next.pendingQuotaLimit,
      billingInterval: next.pendingInterval,
      currentPeriodStart: event.periodStart ?? next.currentPeriodStart,
      currentPeriodEnd: event.periodEnd ?? next.currentPeriodEnd,
      exportsUsed: pendingInterval === "year" ? next.exportsUsed : 0,
    });
    return { snapshot: stampUsageWindow(next, now), retry: false };
  }

  if (cycle) {
    next = {
      ...next,
      exportsUsed: next.billingInterval === "year" ? next.exportsUsed : 0,
      currentPeriodStart: event.periodStart ?? next.currentPeriodStart,
      currentPeriodEnd: event.periodEnd ?? next.currentPeriodEnd,
    };
    return { snapshot: stampUsageWindow(next, now), retry: false };
  }

  if (price) {
    next = transitionPlan(
      next,
      {
        priceId: price.priceId,
        plan: price.plan,
        interval: price.interval,
        quota: price.quota,
        status: next.status,
        periodStart: event.periodStart,
        periodEnd: event.periodEnd,
        cancelAtPeriodEnd: next.cancelAtPeriodEnd,
        customerId: event.customerId,
        subscriptionId: event.subscriptionId,
      },
      "mid_period",
    );
  } else if (event.priceId) {
    return { snapshot, retry: true };
  }

  return { snapshot: stampUsageWindow(next, now), retry: false };
}

/** Keep an existing usage count when a row has never recorded a window. */
function stampUsageWindow(snapshot: BillingSnapshot, now: Date): BillingSnapshot {
  if (snapshot.usagePeriodStart) return snapshot;
  return { ...snapshot, usagePeriodStart: utcMonthWindow(now).start };
}

export function stripeId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}

export function unixToIso(value: unknown): string | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

export function asBillingStatus(value: unknown): BillingStatus {
  if (typeof value === "string" && (BILLING_STATUSES as readonly string[]).includes(value)) {
    return value as BillingStatus;
  }
  return "past_due";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function metadataUserId(object: Record<string, unknown>): string | null {
  const metadata = asRecord(object.metadata);
  const fromMeta = metadata && typeof metadata.user_id === "string" ? metadata.user_id.trim() : "";
  if (fromMeta && isUuid(fromMeta)) return fromMeta;
  const reference = typeof object.client_reference_id === "string" ? object.client_reference_id.trim() : "";
  if (reference && isUuid(reference)) return reference;
  return null;
}

function priceIdFromItem(item: Record<string, unknown>): string | null {
  if (typeof item.price === "string" && item.price.startsWith("price_")) return item.price;
  const price = asRecord(item.price);
  if (price && typeof price.id === "string" && price.id.startsWith("price_")) return price.id;
  const pricing = asRecord(item.pricing);
  const details = pricing ? asRecord(pricing.price_details) : null;
  if (details && typeof details.price === "string") return details.price;
  return null;
}

function periodFromItem(item: Record<string, unknown>): { start: string | null; end: string | null } {
  const period = asRecord(item.period);
  return {
    start: unixToIso(item.current_period_start) ?? unixToIso(period?.start),
    end: unixToIso(item.current_period_end) ?? unixToIso(period?.end),
  };
}

function firstItem(object: Record<string, unknown>): Record<string, unknown> | null {
  const items = asRecord(object.items);
  const lines = asRecord(object.lines);
  const list = items?.data ?? lines?.data;
  if (!Array.isArray(list) || list.length === 0) return null;
  return asRecord(list[0]);
}

export function normalizeStripeEvent(event: { type?: unknown; data?: unknown }): NormalizedEvent {
  const type = typeof event.type === "string" ? event.type : "";
  const data = asRecord(event.data);
  const object = data ? asRecord(data.object) : null;
  if (!object) return { type: "ignored" };

  if (type === "checkout.session.completed") {
    if (object.mode !== "subscription") return { type: "ignored" };
    return {
      type: "checkout_completed",
      userId: metadataUserId(object),
      customerId: stripeId(object.customer),
      subscriptionId: stripeId(object.subscription),
    };
  }

  if (type === "customer.subscription.created" || type === "customer.subscription.updated") {
    const subscriptionId = stripeId(object.id) ?? stripeId(object);
    if (!subscriptionId) return { type: "ignored" };
    const item = firstItem(object);
    const period = item ? periodFromItem(item) : { start: null, end: null };
    return {
      type: "subscription_upsert",
      userId: metadataUserId(object),
      customerId: stripeId(object.customer),
      subscriptionId,
      priceId: item ? priceIdFromItem(item) : null,
      status: asBillingStatus(object.status),
      periodStart: unixToIso(object.current_period_start) ?? period.start,
      periodEnd: unixToIso(object.current_period_end) ?? period.end,
      cancelAtPeriodEnd: object.cancel_at_period_end === true,
    };
  }

  if (type === "customer.subscription.deleted") {
    return {
      type: "subscription_deleted",
      customerId: stripeId(object.customer),
      subscriptionId: stripeId(object.id),
    };
  }

  if (type === "invoice.paid" || type === "invoice.payment_failed") {
    const item = firstItem(object);
    const period = item ? periodFromItem(item) : { start: null, end: null };
    if (type === "invoice.payment_failed") {
      return {
        type: "invoice_payment_failed",
        customerId: stripeId(object.customer),
        subscriptionId: stripeId(object.subscription),
      };
    }
    return {
      type: "invoice_paid",
      billingReason: typeof object.billing_reason === "string" ? object.billing_reason : null,
      customerId: stripeId(object.customer),
      subscriptionId: stripeId(object.subscription),
      priceId: item ? priceIdFromItem(item) : null,
      periodStart: period.start,
      periodEnd: period.end,
    };
  }

  return { type: "ignored" };
}

export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  nowSeconds: number,
  toleranceSeconds = 300,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!secret) return { ok: false, reason: "missing_secret" };
  if (!header) return { ok: false, reason: "missing_header" };

  let timestamp = Number.NaN;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") timestamp = Number(value);
    if (key === "v1" && value) signatures.push(value);
  }

  if (!Number.isFinite(timestamp) || signatures.length === 0) {
    return { ok: false, reason: "malformed_header" };
  }
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return { ok: false, reason: "timestamp_out_of_tolerance" };
  }

  const expected = await hmacHex(secret, `${timestamp}.${payload}`);
  const match = signatures.some((signature) => timingSafeEqual(expected, signature));
  if (!match) return { ok: false, reason: "bad_signature" };
  return { ok: true };
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const raw = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(raw)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function secretsMatch(left: string, right: string): boolean {
  return timingSafeEqual(left, right);
}
