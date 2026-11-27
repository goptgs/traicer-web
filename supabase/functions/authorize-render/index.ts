/**
 * Server-to-server quota check for the Modal render API.
 *
 * POST /functions/v1/authorize-render
 * apikey: <SUPABASE_ANON_KEY>
 * Authorization: Bearer <SUPABASE_ANON_KEY>
 * X-Render-Secret: <RENDER_SHARED_SECRET>
 * Content-Type: application/json
 *
 * { "user_id": "<auth user uuid>", "clip_id": "<render job id>" }
 *
 * 200 { "allowed": true, "consumed": false, "remaining": 49, "quota_limit": 50,
 *       "exports_used": 1, "plan": "pro", "resets_at": "<iso>", "replay": false }
 *   consumed false — a browser grant from consume-export was redeemed, or this
 *   is a retry within 30 minutes. Quota was not incremented again.
 *   consumed true — this call incremented quota (the browser did not).
 *
 * 200 { "allowed": false, "reason": "quota" | "past_due" | "billing" | "invalid", ... }
 * 401 { "allowed": false, "reason": "unauthorized" }   bad or missing secret
 * 503 { "allowed": false, "reason": "unavailable" }    server env is missing
 *
 * Grants last 6 hours. Call this after the browser's requestExport, once per
 * render. Retries of this request within 30 minutes do not count again.
 */
import { secretsMatch } from "../_shared/billing.ts";
import { callRpc, serviceEnv } from "../_shared/admin.ts";
import { empty, envValue, json, readJson } from "../_shared/http.ts";
import { isUuid } from "../_shared/billing.ts";

function publicBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return { allowed: false, reason: "billing" };
  const copy = { ...(body as Record<string, unknown>) };
  delete copy.grant_id;
  return copy;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty();
  if (req.method !== "POST") return json({ allowed: false, reason: "invalid" }, 405);

  const secret = envValue("RENDER_SHARED_SECRET");
  if (!secret || !serviceEnv()) return json({ allowed: false, reason: "unavailable" }, 503);

  const presented = req.headers.get("x-render-secret") ?? "";
  if (!presented || !secretsMatch(presented, secret)) {
    return json({ allowed: false, reason: "unauthorized" }, 401);
  }

  const body = await readJson(req);
  const userId = typeof body?.user_id === "string" ? body.user_id.trim() : "";
  const clipId = typeof body?.clip_id === "string" ? body.clip_id.trim() : "";
  if (!isUuid(userId) || !clipId || clipId.length > 200) {
    return json({ allowed: false, reason: "invalid" }, 400);
  }

  try {
    const result = await callRpc("authorize_render", { p_user_id: userId, p_clip_id: clipId });
    return json(publicBody(result));
  } catch (error) {
    console.error("authorize_render", error instanceof Error ? error.message : "failed");
    return json({ allowed: false, reason: "unavailable" }, 502);
  }
});
