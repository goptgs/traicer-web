import { STRIPE_PRICE_ENV, type EnvSource } from "./billing.ts";
import { envValue } from "./http.ts";

export function readPriceEnv(): EnvSource {
  const env: EnvSource = {};
  for (const names of Object.values(STRIPE_PRICE_ENV)) {
    env[names.month] = Deno.env.get(names.month);
    env[names.year] = Deno.env.get(names.year);
  }
  return env;
}

export function stripeSecret(): string | null {
  return envValue("STRIPE_SECRET_KEY");
}

export async function stripeForm(
  path: string,
  params: URLSearchParams,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const secret = stripeSecret();
  if (!secret) return { ok: false, status: 503, error: "billing_unavailable" };

  let response: Response;
  try {
    response = await fetch(`https://api.stripe.com${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
  } catch (error) {
    console.error("stripe_network", error instanceof Error ? error.message : "fetch failed");
    return { ok: false, status: 502, error: "stripe_unreachable" };
  }

  let body: Record<string, unknown> = {};
  try {
    const parsed = await response.json();
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    body = {};
  }

  if (!response.ok) {
    const stripeError = body.error;
    const message =
      stripeError && typeof stripeError === "object" && "message" in stripeError
        ? String((stripeError as { message?: unknown }).message ?? "")
        : "";
    console.error("stripe_error", response.status, message);
    return { ok: false, status: response.status, error: "stripe_rejected" };
  }

  return { ok: true, body };
}
