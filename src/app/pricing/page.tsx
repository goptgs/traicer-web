import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { formatMonthlyPrice, pricingNotice, pricingTiers } from "@/config/pricing";
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
        kicker={pricingNotice.kicker}
        title="Draft tiers, not a shop"
        lede={pricingNotice.summary}
      />
      <section className="section tight">
        <div className="wrap">
          <p className="draft-banner" role="note">
            <strong>Early pricing.</strong> These figures can change. Nothing on this page is for
            sale, and there is no checkout.
          </p>
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
                <p className="detail">{tier.detail}</p>
              </li>
            ))}
          </ul>
          <div className="prose price-foot">
            <p>A render is one finished tracer on a clip. Prices are in US dollars.</p>
            <p>
              The web app isn’t open, so these packs can’t be bought. The{" "}
              <Link href="/skill">AI Skill early-access list</Link> is separate, and it doesn’t
              ask you to pay.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
