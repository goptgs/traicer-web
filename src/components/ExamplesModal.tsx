"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { demoClips } from "@/config/demo-clips";
import { TracerVideo } from "@/components/TracerVideo";

const FOCUSABLE = 'a[href], button:not([disabled]), video, input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function ExamplesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const html = document.documentElement;
    const body = document.body;
    const previousHtml = html.style.overflow;
    const previousBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    closeRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !root.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      html.style.overflow = previousHtml;
      body.style.overflow = previousBody;
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id={titleId}>Examples</h2>
          <button ref={closeRef} type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="modal-clips">
          {demoClips.map((clip) => (
            <figure key={clip.id}>
              <TracerVideo clip={clip} />
              <figcaption>
                <h3>{clip.title}</h3>
              </figcaption>
            </figure>
          ))}
        </div>
        <div className="modal-foot">
          <Link className="btn btn-primary btn-lg" href="/try">
            Try it Free!
          </Link>
        </div>
      </div>
    </div>
  );
}
