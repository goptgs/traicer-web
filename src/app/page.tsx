import Link from "next/link";
import { DemoClips } from "@/components/DemoClips";
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
          <div className="hero-copy">
            <h1>
              <span className="name-ai">AI</span>-powered fast, simple, reliable shot tracing.
            </h1>
            <p className="lede">A flight line on the golf video you already have.</p>
            <div className="hero-actions">
              <a className="btn btn-primary btn-lg" href="#how">
                Try it on your clip
              </a>
              <a className="btn btn-secondary btn-lg" href="#examples">
                See examples
              </a>
            </div>
          </div>
          <figure className="hero-visual">
            <img
              src="/media/tracer-sample.svg"
              alt="A computed ball flight over a fairway."
              width={1280}
              height={720}
            />
          </figure>
        </div>
      </section>

      <DemoClips />

      <section className="section tight" id="how" aria-labelledby="how-title">
        <div className="wrap">
          <h2 id="how-title">How it works</h2>
          <ol className="how-steps">
            <li>
              <strong>Bring a clip</strong>
              One swing, ball in view.
            </li>
            <li>
              <strong>Mark the shot</strong>
              Landing, hang time, and shape.
            </li>
            <li>
              <strong>Export</strong>
              Preview the line, then take it in 4K.
            </li>
          </ol>
        </div>
      </section>

      <p className="wrap more-line">
        <Link href="/pricing">Pricing</Link>
        {" · "}
        <Link href="/skill">AI Skill early access</Link>
      </p>
    </>
  );
}
