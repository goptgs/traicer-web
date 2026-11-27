import { PageHero } from "@/components/PageHero";
import { formatMonthlyPrice, pricingTiers } from "@/config/pricing";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Early pricing",
  description:
    "Early pricing for TrAIcer. Draft tiers: Free for 5 renders a month, then $9, $19 and $39. Not final, and there is no checkout.",
  path: "/pricing",
});

export default function PricingPage() {
  return (
    <>
      <PageHero
        kicker="Pricing"
        title="Early pricing"
        lede="Draft numbers. Not for sale. No checkout."
      />
      <section className="section tight">
        <div className="wrap">
          <ul className="pricing-grid">
            {pricingTiers.map((tier) => (
              <li key={tier.id} className="price-card">
                <h2>{tier.name}</h2>
                <p className="price-amount">
                  {formatMonthlyPrice(tier.priceUsd)}
                  {tier.priceUsd > 0 ? <span className="cadence"> / month</span> : null}
                </p>
                <p className="allowance">{tier.allowance}</p>
                {tier.fairUse ? <p className="fair-use">{tier.fairUse}</p> : null}
              </li>
            ))}
          </ul>
          <p className="more-line">A render is one finished tracer. US dollars.</p>
        </div>
      </section>
    </>
  );
}
