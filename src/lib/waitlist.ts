export const AI_CHOICES = ["grok", "claude", "chatgpt", "other"] as const;
export const COMPUTER_CHOICES = ["mac", "pc"] as const;

export type AiChoice = (typeof AI_CHOICES)[number];
export type ComputerChoice = (typeof COMPUTER_CHOICES)[number];

export type WaitlistInput = {
  email: string;
  ai: string;
  aiOther: string;
  computer: string;
  /** Honeypot. Real people never see this field. */
  faxNumber: string;
};

export type FieldErrors = Partial<
  Record<"email" | "ai" | "aiOther" | "computer", string>
>;

export type WaitlistPayload = {
  email: string;
  ai: AiChoice;
  ai_other: string | null;
  computer: ComputerChoice;
  fax_number: string;
};

export type ValidationResult =
  | { ok: true; honeypot: true }
  | { ok: true; honeypot: false; payload: WaitlistPayload }
  | { ok: false; errors: FieldErrors };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AI_SET = new Set<string>(AI_CHOICES);
const COMPUTER_SET = new Set<string>(COMPUTER_CHOICES);

export const MISSING_ENV_MESSAGE =
  "The waitlist isn’t connected on this copy of the site. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, apply the Supabase migration, then rebuild.";

export const RATE_LIMIT_MESSAGE =
  "Too many sign-ups at once. Wait a few minutes and try again.";

export const NETWORK_MESSAGE =
  "We couldn’t reach the waitlist. Check your connection and try again.";

export const GENERIC_MESSAGE =
  "The waitlist didn’t accept that. Check the form and try again. If you run the site, confirm the Supabase URL, the anon key, and that the migration has been applied.";

export type SubmitResult =
  | { status: "success"; already: boolean }
  | { status: "error"; message: string };

export type SupabasePublicConfig = { url: string; anonKey: string };

function readPublicEnv(
  name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY",
): string {
  if (name === "NEXT_PUBLIC_SUPABASE_URL") {
    return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  }
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
}

export function readSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = readPublicEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = readPublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anonKey) return null;
  if (url.includes("YOUR_PROJECT") || anonKey === "your-anon-key") return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
  } catch {
    return null;
  }
  return { url: url.replace(/\/+$/, ""), anonKey };
}

export function validateWaitlist(input: WaitlistInput): ValidationResult {
  if (input.faxNumber.trim() !== "") {
    return { ok: true, honeypot: true };
  }

  const errors: FieldErrors = {};
  const email = input.email.trim().toLowerCase();
  if (!email) {
    errors.email = "Enter an email address.";
  } else if (email.length > 254 || !EMAIL.test(email)) {
    errors.email = "That email doesn’t look complete.";
  }

  const ai = input.ai.trim().toLowerCase();
  if (!AI_SET.has(ai)) {
    errors.ai = "Choose the assistant you use.";
  }

  const aiOther = input.aiOther.trim();
  if (ai === "other") {
    if (!aiOther) {
      errors.aiOther = "Tell us which assistant.";
    } else if (aiOther.length > 80) {
      errors.aiOther = "Keep that to 80 characters.";
    }
  }

  const computer = input.computer.trim().toLowerCase();
  if (!COMPUTER_SET.has(computer)) {
    errors.computer = "Choose Mac or PC.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    honeypot: false,
    payload: {
      email,
      ai: ai as AiChoice,
      ai_other: ai === "other" ? aiOther : null,
      computer: computer as ComputerChoice,
      fax_number: "",
    },
  };
}

type ErrorBody = { code?: string; message?: string };

export function messageForWaitlistError(
  status: number,
  body: ErrorBody | null,
): string {
  if (status === 429 || body?.message === "rate_limited") {
    return RATE_LIMIT_MESSAGE;
  }
  if (body?.code === "23505") {
    return "";
  }
  return GENERIC_MESSAGE;
}

export async function submitWaitlist(
  payload: WaitlistPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<SubmitResult> {
  const config = readSupabasePublicConfig();
  if (!config) {
    return { status: "error", message: MISSING_ENV_MESSAGE };
  }

  let response: Response;
  try {
    response = await fetchImpl(`${config.url}/rest/v1/skill_waitlist`, {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
      credentials: "omit",
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    return { status: "error", message: NETWORK_MESSAGE };
  }

  if (response.ok) {
    return { status: "success", already: false };
  }

  let body: ErrorBody | null = null;
  try {
    body = (await response.json()) as ErrorBody;
  } catch {
    body = null;
  }

  if (body?.code === "23505") {
    return { status: "success", already: true };
  }

  return { status: "error", message: messageForWaitlistError(response.status, body) };
}
