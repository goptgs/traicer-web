"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { heroClip } from "@/config/demo-clips";
import { ExamplesModal } from "@/components/ExamplesModal";
import { TracerVideo } from "@/components/TracerVideo";

export function HomeHero() {
  const [examplesOpen, setExamplesOpen] = useState(false);
  const closeExamples = useCallback(() => setExamplesOpen(false), []);

  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <h1>
              <span className="name-ai">AI</span>-powered fast, simple, reliable shot tracing.
            </h1>
            <p className="lede">Augment your golf videos with beautiful traicers that use real physics.</p>
            <div className="hero-actions">
              <Link className="btn btn-primary btn-lg" href="/try">
                Try it Free!
              </Link>
              <button type="button" className="btn btn-secondary btn-lg" onClick={() => setExamplesOpen(true)}>
                See examples
              </button>
            </div>
          </div>
          <figure className="hero-visual">
            <TracerVideo clip={heroClip} />
          </figure>
        </div>
      </section>
      <ExamplesModal open={examplesOpen} onClose={closeExamples} />
    </>
  );
}
