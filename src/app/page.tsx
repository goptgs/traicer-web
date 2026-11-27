import Link from "next/link";
import { BrandName } from "@/components/BrandName";
import { DemoClips } from "@/components/DemoClips";
import { RealPhysicsBadge } from "@/components/RealPhysicsBadge";
import { TryItTeaser } from "@/components/TryItTeaser";
import { formatMonthlyPrice, pricingNotice, pricingTiers } from "@/config/pricing";
import { site } from "@/config/site";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "TrAIcer — AI-powered shot tracing",
  description: site.description,
  path: "/",
  absoluteTitle: true,
});

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <p className="kicker">Golf shot tracing</p>
            <h1>
              <span className="name-ai">AI</span>-powered fast, simple, reliable shot tracing.
            </h1>
            <p className="lede">
              A television-style ball flight over a golf video you already filmed. The line is
              computed from gravity, drag and spin.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href="#demos">
                See a tracer
              </a>
              <a className="btn btn-secondary" href="#try">
                How you’ll try it
              </a>
            </div>
          </div>
          <div className="hero-badge">
            <RealPhysicsBadge />
            <p className="badge-note">Gravity, drag and spin. Not a drawn-on swoosh.</p>
          </div>
        </div>
      </section>

      <section className="section" id="brief" aria-labelledby="brief-title">
        <div className="wrap">
          <p className="kicker">The brief</p>
          <h2 id="brief-title">Fast to a line you’d actually use</h2>
          <p className="lede">
            Speed, simplicity, and a result you want on the video. Not a tour of settings.
          </p>
          <div className="principles">
            <article>
              <h3>Speed</h3>
              <p>
                A clip in, a flight line out. You mark the landing, set the hang time, pick the
                shape, and you’re looking at a preview — not learning a studio.
              </p>
            </article>
            <article>
              <h3>Simplicity</h3>
              <p>
                The ask stays small. Where it landed, how long it was up, and whether it flew
                high, mid or low — draw, straight or fade. That’s the whole form.
              </p>
            </article>
            <article>
              <h3>Efficacy</h3>
              <p>
                The line has to be one you want on the video. Computed from the shot, easy to
                read, and worth keeping. If it isn’t useful, it doesn’t belong.
              </p>
            </article>
          </div>
        </div>
      </section>

      <DemoClips />
      <TryItTeaser />

      <section className="section" aria-labelledby="prices-title">
        <div className="wrap">
          <p className="kicker">{pricingNotice.kicker}</p>
          <h2 id="prices-title">A free start, then tracer packs</h2>
          <p className="lede">{pricingNotice.summary}</p>
          <ul className="price-strip">
            {pricingTiers.map((tier) => (
              <li key={tier.id}>
                <p className="price-name">{tier.name}</p>
                <p className="price-amount">
                  {formatMonthlyPrice(tier.priceUsd)}
                  {tier.priceUsd > 0 ? <span className="cadence"> / month</span> : null}
                </p>
                <p className="allowance">{tier.allowance}</p>
                {tier.fairUse ? <p className="fair-use">{tier.fairUse}</p> : null}
              </li>
            ))}
          </ul>
          <p className="try-note">
            <Link href="/pricing">Read the draft tiers</Link>
          </p>
        </div>
      </section>

      <section className="section skill-band" aria-labelledby="skill-title">
        <div className="wrap">
          <p className="kicker">Coming alongside the app</p>
          <h2 id="skill-title">
            The <BrandName /> AI Skill
          </h2>
          <p className="lede">
            The brains behind the web app, for Grok, Claude and ChatGPT. Early access is a list,
            so we can write when there’s something to try.
          </p>
          <Link className="btn btn-primary" href="/skill#early-access">
            Join early access
          </Link>
        </div>
      </section>
    </>
  );
}
