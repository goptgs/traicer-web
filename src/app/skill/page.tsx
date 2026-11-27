import { BrandName } from "@/components/BrandName";
import { EarlyAccessForm } from "@/components/EarlyAccessForm";
import { PageHero } from "@/components/PageHero";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "AI Skill early access",
  description:
    "The TrAIcer AI Skill is the brains behind the web app, for Grok, Claude and ChatGPT. Join the early-access list.",
  path: "/skill",
});

export default function SkillPage() {
  return (
    <>
      <PageHero
        kicker="Coming soon"
        title={
          <>
            The <BrandName /> AI Skill
          </>
        }
        lede="The brains behind the web app, for Grok, Claude and ChatGPT. The same tracer, asked for in the assistant you already use."
      />
      <section className="section tight" id="early-access">
        <div className="wrap skill-grid">
          <div className="prose">
            <h2>A real product, not a maybe</h2>
            <p>
              The web app is the place you’ll drop a clip. The skill is the part that knows how
              the flight is computed — gravity, drag and spin — and how to put that line on the
              video. One brain, two doors.
            </p>
            <p>It will run in Grok, Claude and ChatGPT. It is not something you can install today.</p>
            <ul>
              <li>Same tracer as the web app, inside the assistant you already use.</li>
              <li>Early access is a list. We write when there’s something to try.</li>
              <li>Tell us Mac or PC so we know which computers to support first.</li>
            </ul>
            <p>No download yet, and no payment from this page.</p>
          </div>
          <div className="form-card">
            <h2>Join early access</h2>
            <EarlyAccessForm />
          </div>
        </div>
      </section>
    </>
  );
}
