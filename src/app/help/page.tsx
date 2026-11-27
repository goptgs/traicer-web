import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/PageHero";
import { faqs } from "@/config/faq";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Help",
  description:
    "What TrAIcer does, which clips it can take, how uploads will be treated, and when the AI Skill arrives.",
  path: "/help",
});

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

export default function HelpPage() {
  return (
    <>
      <JsonLd data={faqJsonLd} />
      <PageHero
        kicker="Help"
        title="Short answers"
        lede="What it does, what a clip needs, and what isn’t open yet. If we haven’t tried it, we don’t claim it."
      />
      <section className="section tight">
        <div className="wrap">
          <div className="faq-list">
            {faqs.map((item) => (
              <article key={item.id} className="faq-item" id={item.id}>
                <h2>{item.question}</h2>
                <p>{item.answer}</p>
                {item.links ? (
                  <p className="faq-links">
                    {item.links.map((link) => (
                      <Link key={link.href} href={link.href}>
                        {link.label}
                      </Link>
                    ))}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
