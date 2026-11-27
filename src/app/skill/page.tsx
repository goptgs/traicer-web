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
        kicker="AI Skill"
        title={
          <>
            <BrandName /> for Grok, Claude and ChatGPT
          </>
        }
        lede="The brains behind the web app. Not ready to install. Join the list and we’ll write when it is."
      />
      <section className="section tight" id="early-access">
        <div className="wrap skill-grid">
          <div className="prose">
            <h2>Early access</h2>
            <p>Same tracer, inside the assistant you already use.</p>
            <p>Email, which assistant, and Mac or PC. That’s the whole form.</p>
          </div>
          <div className="form-card">
            <h2>Join the list</h2>
            <EarlyAccessForm />
          </div>
        </div>
      </section>
    </>
  );
}
