import { PageHero } from "@/components/PageHero";
import { site } from "@/config/site";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Privacy draft",
  description:
    "Draft privacy note for TrAIcer, published by PTGS LLC. Not the final policy. This site does not take video yet.",
  path: "/privacy",
  noindex: true,
});

export default function PrivacyPage() {
  return (
    <>
      <PageHero
        kicker="Draft"
        title="Privacy"
        lede="A placeholder, so you can see what this site does today. It is not the finished policy."
      />
      <section className="section tight">
        <div className="wrap prose">
          <p className="draft-banner" role="note">
            <strong>Draft.</strong> This note will be replaced before launch. Don’t treat it as the
            final privacy policy.
          </p>
          <h2>Who publishes this</h2>
          <p>
            {site.publisher} publishes {site.name}. A contact address will be added here before
            launch.
          </p>
          <h2>What this site collects now</h2>
          <p>
            The marketing pages don’t ask you to sign in, and they don’t run an advertising
            tracker. The only form is the AI Skill early-access list. If you send it, we store:
          </p>
          <ul>
            <li>your email address</li>
            <li>which assistant you use (Grok, Claude, ChatGPT, or another you name)</li>
            <li>whether you use a Mac or a PC</li>
            <li>the time the row was saved</li>
          </ul>
          <p>
            Those rows sit in a Supabase database so we can write when the skill is ready. A
            hidden field is there to catch simple bots. If that field is filled in, we don’t keep
            the row. We don’t ask for a card, and we don’t sell this list.
          </p>
          <p>
            The form also remembers, in this browser only, when you last pressed send, so a double
            click doesn’t fire twice. That stays on your machine.
          </p>
          <h2>Video</h2>
          <p>
            This site does not accept video. When the web app opens, a clip will be used to draw
            the tracer and then removed on a schedule. That paragraph will be rewritten, with the
            real retention window, before any upload is accepted.
          </p>
          <h2>Cookies</h2>
          <p>
            These pages don’t set their own cookies. The waitlist request goes to Supabase. How
            that host handles the connection is covered by Supabase’s own policy.
          </p>
        </div>
      </section>
    </>
  );
}
