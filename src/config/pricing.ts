/**
 * V01 prices. Change the numbers here only.
 * Stripe price IDs are not in this file. They are Supabase Edge Function
 * secrets: STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_ANNUAL,
 * STRIPE_PRICE_STUDIO_MONTHLY, STRIPE_PRICE_STUDIO_ANNUAL.
 *
 * Every paid tier has the same monthly render cap on both intervals.
 * Monthly plans reset when the Stripe period renews. Annual plans reset
 * on the UTC calendar month, inside the paid year.
 */

/** Renders on the free plan. One constant for the site, the webhook, and SQL. */
export const FREE_QUOTA = 5;

export const pricingNotice = {
  kicker: "Pricing",
  summary: "Free, Pro, and Studio. US dollars.",
} as const;

export const PLAN_IDS = ["free", "pro", "studio"] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export type PaidPlanId = Exclude<PlanId, "free">;
export type BillingInterval = "month" | "year";

export const STRIPE_PRICE_ENV: Record<PaidPlanId, { month: string; year: string }> = {
  pro: { month: "STRIPE_PRICE_PRO_MONTHLY", year: "STRIPE_PRICE_PRO_ANNUAL" },
  studio: { month: "STRIPE_PRICE_STUDIO_MONTHLY", year: "STRIPE_PRICE_STUDIO_ANNUAL" },
};

export type PricingTier = {
  id: PlanId;
  name: string;
  /** Monthly price in US dollars. Zero is the free tier. */
  priceUsd: number;
  /** Annual price in US dollars, billed once a year. */
  annualPriceUsd?: number;
  /** Shown on the annual price. The toggle is always available. */
  annualSaving?: string;
  /** Renders per month. Studio is the fair-use cap. */
  quota: number;
  allowance: string;
  /** Shown under the allowance when the tier has a fair-use cap. */
  fairUse?: string;
  detail: string;
};

function allowanceFor(id: PlanId, quota: number): string {
  if (id === "studio") return "Unlimited";
  return `${quota} renders / month`;
}

function tier(input: {
  id: PlanId;
  name: string;
  priceUsd: number;
  annualPriceUsd?: number;
  annualSaving?: string;
  quota: number;
  fairUse?: string;
  detail: string;
}): PricingTier {
  return {
    ...input,
    allowance: allowanceFor(input.id, input.quota),
  };
}

export const pricingTiers: readonly PricingTier[] = [
  tier({
    id: "free",
    name: "Free",
    priceUsd: 0,
    quota: FREE_QUOTA,
    detail: "No watermark.",
  }),
  tier({
    id: "pro",
    name: "Pro",
    priceUsd: 4.99,
    annualPriceUsd: 29,
    annualSaving: "Save ~50%",
    quota: 300,
    detail: "For a regular month of filming.",
  }),
  tier({
    id: "studio",
    name: "Studio",
    priceUsd: 6.99,
    annualPriceUsd: 49,
    annualSaving: "Save ~42%",
    quota: 1000,
    fairUse: "Fair use: 1,000 renders / month.",
    detail: "The cap is real. Unlimited means up to that fair-use line.",
  }),
];

const PLAN_SET = new Set<string>(PLAN_IDS);

export function isPlanId(value: string): value is PlanId {
  return PLAN_SET.has(value);
}

export function isPaidPlanId(value: string): value is PaidPlanId {
  return value === "pro" || value === "studio";
}

export function tierById(id: string): PricingTier | undefined {
  return pricingTiers.find((item) => item.id === id);
}

export function formatUsd(amount: number): string {
  if (amount === 0) return "Free";
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

export function formatMonthlyPrice(priceUsd: number): string {
  return formatUsd(priceUsd);
}

/** Monthly render cap. Annual checkout uses the same number. */
export function periodQuota(plan: PlanId, _interval: BillingInterval = "month"): number {
  return tierById(plan)?.quota ?? FREE_QUOTA;
}

export function paidTiers(): PricingTier[] {
  return pricingTiers.filter((item) => item.id !== "free");
}
