/**
 * Draft web-app prices. Change them here only — the pricing page and the
 * home-page strip both read this file. The AI Skill page must not.
 * Nothing here is for sale yet. There is no checkout in M1.
 */
export const pricingNotice = {
  kicker: "Early pricing",
  summary:
    "Draft figures. Not final, and not for sale yet. There is no checkout.",
} as const;

export type PricingTier = {
  id: string;
  name: string;
  /** Monthly price in US dollars. Zero is the free tier. */
  priceUsd: number;
  allowance: string;
  /** Shown under the allowance when the tier has a fair-use cap. */
  fairUse?: string;
  detail: string;
};

export const pricingTiers: readonly PricingTier[] = [
  {
    id: "free",
    name: "Free",
    priceUsd: 0,
    allowance: "5 renders / month",
    detail: "Enough to try the tracer on your own clips.",
  },
  {
    id: "level-1",
    name: "Level 1",
    priceUsd: 9,
    allowance: "50 renders / month",
    detail: "For a player who films most weeks.",
  },
  {
    id: "level-2",
    name: "Level 2",
    priceUsd: 19,
    allowance: "200 renders / month",
    detail: "For a heavy week of filming.",
  },
  {
    id: "level-3",
    name: "Level 3",
    priceUsd: 39,
    allowance: "Unlimited",
    fairUse: "Fair use: 500 renders / month.",
    detail: "The cap is real. Unlimited means up to that fair-use line.",
  },
];

export function formatMonthlyPrice(priceUsd: number): string {
  if (priceUsd === 0) return "Free";
  return `$${priceUsd}`;
}
