"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  MISSING_ENV_MESSAGE,
  readSupabasePublicConfig,
  submitWaitlist,
  validateWaitlist,
  type FieldErrors,
  type SubmitResult,
} from "@/lib/waitlist";

const COOLDOWN_MS = 15000;
const COOLDOWN_KEY = "traicer-waitlist-at";

const assistants = [
  { value: "grok", label: "Grok" },
  { value: "claude", label: "Claude" },
  { value: "chatgpt", label: "ChatGPT" },
  { value: "other", label: "Other" },
] as const;

export function EarlyAccessForm() {
  const [ai, setAi] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [pending, setPending] = useState(false);
  const successRef = useRef<HTMLDivElement>(null);
  const configured = readSupabasePublicConfig() !== null;

  useEffect(() => {
    if (result?.status === "success") {
      successRef.current?.focus();
    }
  }, [result]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const data = new FormData(event.currentTarget);
    const validated = validateWaitlist({
      email: String(data.get("email") ?? ""),
      ai: String(data.get("ai") ?? ""),
      aiOther: String(data.get("ai_other") ?? ""),
      computer: String(data.get("computer") ?? ""),
      faxNumber: String(data.get("fax_number") ?? ""),
    });

    if (!validated.ok) {
      setErrors(validated.errors);
      setResult(null);
      const first = validated.errors.email
        ? "email"
        : validated.errors.ai
          ? "ai-grok"
          : validated.errors.aiOther
            ? "ai-other"
            : "computer-mac";
      document.getElementById(first)?.focus();
      return;
    }

    setErrors({});

    if (validated.honeypot) {
      setResult({ status: "success", already: false });
      return;
    }

    if (!readSupabasePublicConfig()) {
      setResult({ status: "error", message: MISSING_ENV_MESSAGE });
      return;
    }

    const last = Number(window.sessionStorage.getItem(COOLDOWN_KEY) || 0);
    if (Number.isFinite(last) && Date.now() - last < COOLDOWN_MS) {
      setResult({
        status: "error",
        message: "Please wait a moment before sending that again.",
      });
      return;
    }

    setPending(true);
    const submitted = await submitWaitlist(validated.payload);
    setPending(false);
    window.sessionStorage.setItem(COOLDOWN_KEY, String(Date.now()));
    setResult(submitted);
  }

  if (result?.status === "success") {
    return (
      <div className="success-panel" role="status" tabIndex={-1} ref={successRef}>
        <h3>{result.already ? "You’re already on the list." : "You’re on the list."}</h3>
        <p>
          {result.already
            ? "We’ll write when the TrAIcer AI Skill is ready to try. No payment, and nothing else to do."
            : "We’ll email you when the TrAIcer AI Skill is ready for early access. No payment, no account — a note when there’s something to try."}
        </p>
      </div>
    );
  }

  return (
    <form className="waitlist-form" onSubmit={onSubmit} noValidate aria-busy={pending}>
      <noscript>
        <p className="form-note">
          JavaScript is off, so this form can’t reach the waitlist. Turn it on to join.
        </p>
      </noscript>

      {!configured && result?.status !== "error" ? (
        <p className="form-alert" role="status">
          {MISSING_ENV_MESSAGE}
        </p>
      ) : null}

      {result?.status === "error" ? (
        <p className="form-alert" role="alert">
          {result.message}
        </p>
      ) : null}

      <div className="field">
        <label htmlFor="email">
          Email <span className="req">(required)</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={254}
          required
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "email-error" : undefined}
        />
        {errors.email ? (
          <p id="email-error" className="field-error">
            {errors.email}
          </p>
        ) : (
          <p className="hint">We’ll write to this address when the skill is ready.</p>
        )}
      </div>

      <fieldset className="field" aria-describedby={errors.ai ? "ai-error" : undefined}>
        <legend>
          Which AI do you use? <span className="req">(required)</span>
        </legend>
        <div className="choices">
          {assistants.map((option) => (
            <label key={option.value} className="choice">
              <input
                id={option.value === "grok" ? "ai-grok" : undefined}
                type="radio"
                name="ai"
                value={option.value}
                checked={ai === option.value}
                onChange={() => {
                  setAi(option.value);
                  if (option.value === "other") {
                    requestAnimationFrame(() => {
                      document.getElementById("ai-other")?.focus();
                    });
                  }
                }}
              />
              {option.label}
            </label>
          ))}
        </div>
        {errors.ai ? (
          <p id="ai-error" className="field-error">
            {errors.ai}
          </p>
        ) : null}
      </fieldset>

      {ai === "other" ? (
        <div className="field">
          <label htmlFor="ai-other">
            Which assistant? <span className="req">(required)</span>
          </label>
          <input
            id="ai-other"
            name="ai_other"
            type="text"
            autoComplete="off"
            maxLength={80}
            aria-invalid={errors.aiOther ? true : undefined}
            aria-describedby={errors.aiOther ? "ai-other-error" : undefined}
          />
          {errors.aiOther ? (
            <p id="ai-other-error" className="field-error">
              {errors.aiOther}
            </p>
          ) : null}
        </div>
      ) : null}

      <fieldset
        className="field"
        aria-describedby={errors.computer ? "computer-error" : undefined}
      >
        <legend>
          Computer <span className="req">(required)</span>
        </legend>
        <div className="choices choices-2">
          <label className="choice">
            <input id="computer-mac" type="radio" name="computer" value="mac" />
            Mac
          </label>
          <label className="choice">
            <input type="radio" name="computer" value="pc" />
            PC
          </label>
        </div>
        {errors.computer ? (
          <p id="computer-error" className="field-error">
            {errors.computer}
          </p>
        ) : (
          <p className="hint">So we know which computers to support first.</p>
        )}
      </fieldset>

      <div className="hp" aria-hidden="true">
        <label htmlFor="fax-number">Fax</label>
        <input
          id="fax-number"
          name="fax_number"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Join early access"}
      </button>
      <p className="form-note">
        Interest only. We’ll store your email, the assistant you use, and Mac or PC. That’s all.{" "}
        <a href="/privacy">Draft privacy note</a>
      </p>
    </form>
  );
}
