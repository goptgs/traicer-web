import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GENERIC_MESSAGE,
  MISSING_ENV_MESSAGE,
  RATE_LIMIT_MESSAGE,
  messageForWaitlistError,
  readSupabasePublicConfig,
  submitWaitlist,
  validateWaitlist,
} from "./waitlist.ts";

const valid = {
  email: "  Golfer@Example.com ",
  ai: "claude",
  aiOther: "",
  computer: "mac",
  faxNumber: "",
};

describe("validateWaitlist", () => {
  it("accepts a complete entry and normalises the email", () => {
    const result = validateWaitlist(valid);
    assert.equal(result.ok, true);
    if (result.ok && !result.honeypot) {
      assert.equal(result.payload.email, "golfer@example.com");
      assert.equal(result.payload.ai, "claude");
      assert.equal(result.payload.ai_other, null);
      assert.equal(result.payload.computer, "mac");
      assert.equal(result.payload.fax_number, "");
    }
  });

  it("requires a named assistant when Other is chosen", () => {
    const missing = validateWaitlist({ ...valid, ai: "other", aiOther: "  " });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.errors.aiOther, "Tell us which assistant.");

    const named = validateWaitlist({ ...valid, ai: "other", aiOther: " Gemini " });
    assert.equal(named.ok, true);
    if (named.ok && !named.honeypot) {
      assert.equal(named.payload.ai, "other");
      assert.equal(named.payload.ai_other, "Gemini");
    }
  });

  it("rejects an incomplete email and a missing computer", () => {
    const result = validateWaitlist({ ...valid, email: "not-an-email", computer: "" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.email);
      assert.ok(result.errors.computer);
    }
  });

  it("treats a filled honeypot as a quiet success", () => {
    const result = validateWaitlist({ ...valid, email: "", faxNumber: "spam" });
    assert.deepEqual(result, { ok: true, honeypot: true });
  });
});

describe("readSupabasePublicConfig", () => {
  it("fails closed when the env vars are missing or still the example", () => {
    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    assert.equal(readSupabasePublicConfig(), null);

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "your-anon-key";
    assert.equal(readSupabasePublicConfig(), null);

    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    assert.equal(readSupabasePublicConfig(), null);

    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
  });
});

describe("submitWaitlist", () => {
  it("returns a clear message instead of throwing when env is missing", async () => {
    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    let called = false;
    const result = await submitWaitlist(
      {
        email: "golfer@example.com",
        ai: "grok",
        ai_other: null,
        computer: "pc",
        fax_number: "",
      },
      () => {
        called = true;
        throw new Error("should not be called");
      },
    );

    assert.equal(called, false);
    assert.deepEqual(result, { status: "error", message: MISSING_ENV_MESSAGE });

    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
  });

  it("maps duplicate and rate-limit responses", () => {
    assert.equal(messageForWaitlistError(409, { code: "23505", message: "duplicate" }), "");
    assert.equal(
      messageForWaitlistError(400, { code: "P0001", message: "rate_limited" }),
      RATE_LIMIT_MESSAGE,
    );
    assert.equal(messageForWaitlistError(500, null), GENERIC_MESSAGE);
  });
});
