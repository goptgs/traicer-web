import { isUuid } from "./billing.ts";
import { envValue } from "./http.ts";

export type AuthUser = { id: string; email: string | null };

export function serviceEnv(): { url: string; serviceKey: string; anonKey: string } | null {
  const url = envValue("SUPABASE_URL");
  const serviceKey = envValue("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = envValue("SUPABASE_ANON_KEY");
  if (!url || !serviceKey || !anonKey) return null;
  return { url: url.replace(/\/+$/, ""), serviceKey, anonKey };
}

export async function userFromRequest(req: Request): Promise<AuthUser | null> {
  const config = serviceEnv();
  if (!config) return null;
  const header = req.headers.get("Authorization") ?? "";
  const token = header.slice(0, 7).toLowerCase() === "bearer " ? header.slice(7).trim() : "";
  if (!token || token === config.anonKey || token === config.serviceKey) return null;

  let response: Response;
  try {
    response = await fetch(`${config.url}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: config.anonKey,
      },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const body = await response.json().catch(() => null);
  const id = body && typeof body.id === "string" ? body.id : "";
  if (!isUuid(id)) return null;
  const email = body && typeof body.email === "string" ? body.email : null;
  return { id, email };
}

async function rest(path: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  const config = serviceEnv();
  if (!config) return { status: 503, body: { error: "billing_unavailable" } };
  const headers = new Headers(init.headers);
  headers.set("apikey", config.serviceKey);
  headers.set("Authorization", `Bearer ${config.serviceKey}`);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${config.url}/rest/v1/${path}`, { ...init, headers });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, body };
}

export async function selectEntitlement(filter: string): Promise<Record<string, unknown> | null> {
  const result = await rest(`entitlements?${filter}&select=*`, {
    headers: { Accept: "application/json" },
  });
  if (!Array.isArray(result.body) || result.body.length === 0) return null;
  const row = result.body[0];
  if (!row || typeof row !== "object") return null;
  return row as Record<string, unknown>;
}

function stripeKey(value: string | null | undefined): string | null {
  if (!value || !/^[A-Za-z0-9_]+$/.test(value)) return null;
  return value;
}

export async function findEntitlement(keys: {
  userId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
}): Promise<Record<string, unknown> | null> {
  if (keys.userId && isUuid(keys.userId)) {
    const row = await selectEntitlement(`user_id=eq.${keys.userId}`);
    if (row) return row;
  }
  const subscriptionId = stripeKey(keys.subscriptionId);
  if (subscriptionId) {
    const row = await selectEntitlement(`stripe_subscription_id=eq.${subscriptionId}`);
    if (row) return row;
  }
  const customerId = stripeKey(keys.customerId);
  if (customerId) {
    const row = await selectEntitlement(`stripe_customer_id=eq.${customerId}`);
    if (row) return row;
  }
  return null;
}

export async function insertEntitlement(row: Record<string, unknown>): Promise<void> {
  const result = await rest("entitlements", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(row),
  });
  if (result.status >= 300 && result.status !== 409) {
    throw new Error(`entitlement_insert_${result.status}`);
  }
}

export async function updateEntitlement(
  userId: string,
  updatedAt: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const result = await rest(
    `entitlements?user_id=eq.${userId}&updated_at=eq.${encodeURIComponent(updatedAt)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    },
  );
  return Array.isArray(result.body) && result.body.length > 0;
}

export async function claimStripeEvent(
  id: string,
  eventType: string,
): Promise<"claimed" | "duplicate" | "pending"> {
  const safeId = encodeURIComponent(id);
  const result = await rest("stripe_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ stripe_event_id: id, event_type: eventType, completed: false }),
  });
  if (result.status === 201 || result.status === 200 || result.status === 204) return "claimed";
  const body = result.body;
  const code =
    body && typeof body === "object" && "code" in body ? String((body as { code?: unknown }).code ?? "") : "";
  if (result.status !== 409 && code !== "23505") {
    throw new Error(`stripe_event_insert_${result.status}`);
  }

  const existing = await rest(`stripe_events?stripe_event_id=eq.${safeId}&select=completed,received_at`);
  const row = Array.isArray(existing.body) ? existing.body[0] : null;
  if (!row || typeof row !== "object") return "pending";
  if ((row as { completed?: unknown }).completed === true) return "duplicate";
  const receivedAt = Date.parse(String((row as { received_at?: unknown }).received_at ?? ""));
  if (Number.isFinite(receivedAt) && Date.now() - receivedAt < 60_000) return "pending";
  await rest(`stripe_events?stripe_event_id=eq.${safeId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ received_at: new Date().toISOString(), completed: false }),
  });
  return "claimed";
}

export async function completeStripeEvent(id: string): Promise<void> {
  const result = await rest(`stripe_events?stripe_event_id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ completed: true }),
  });
  if (result.status >= 300) throw new Error(`stripe_event_complete_${result.status}`);
}

export async function callRpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await rest(`rpc/${name}`, {
    method: "POST",
    body: JSON.stringify(args),
  });
  if (result.status >= 300) {
    console.error("rpc_failed", name, result.status);
    throw new Error(`rpc_${name}_${result.status}`);
  }
  return result.body;
}
