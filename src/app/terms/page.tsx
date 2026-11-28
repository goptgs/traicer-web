import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { site } from "@/config/site";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Terms draft",
  description:
    "Draft terms for TrAIcer, published by PTGS LLC. Not a contract, and not an offer to sell.",
  path: "/terms",
  noindex: true,
});

export default function TermsPage() {
  return (
    <>
      <PageHero
        kicker="Draft"
        title="Terms"
        lede="A placeholder. This is not a contract, and it is not an offer to sell anything."
      />
      <section className="section tight">
        <div className="wrap prose">
          <p className="draft-banner" role="note">
            <strong>Draft.</strong> These terms will be replaced before launch. They don’t create
            an account, a subscription, or a sale.
          </p>
          <h2>The site</h2>
          <p>
            {site.name} is published by {site.publisher}. The pages describe a shot-tracing product
            that is not open yet. Copy, prices and features can change.
          </p>
          <h2>Nothing is for sale here</h2>
          <p>
            The figures on the <Link href="/pricing">pricing page</Link> are an early draft. There
            is no checkout. You can’t buy a pack from this site, and joining the{" "}
            <Link href="/skill">AI Skill list</Link> doesn’t reserve a price or start a bill.
          </p>
          <h2>Your clips, later</h2>
          <p>
            When an uploader exists, you’ll be asked to send only video you’re allowed to use.
            That rule isn’t in force yet, because this site doesn’t take video.
          </p>
          <h2>No warranty on an unopened product</h2>
          <p>
            The tracer isn’t available from these pages. Don’t rely on this draft for a broadcast,
            a coach, or a purchase. The finished terms will say what the product promises, and
            what it doesn’t, before anyone can pay.
          </p>
        </div>
      </section>
    </>
  );
}
