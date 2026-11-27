import Link from "next/link";
import { HomeHero } from "@/components/HomeHero";
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
      <HomeHero />

      <section className="section tight" id="how" aria-labelledby="how-title">
        <div className="wrap">
          <h2 id="how-title">How it works</h2>
          <ol className="how-steps">
            <li>
              <strong>Bring a clip</strong>
              One swing, or a batch.
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
