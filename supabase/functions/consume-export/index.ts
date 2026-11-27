import { callRpc, serviceEnv, userFromRequest } from "../_shared/admin.ts";
import { empty, json, readJson } from "../_shared/http.ts";

function publicBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return { allowed: false, reason: "billing" };
  const copy = { ...(body as Record<string, unknown>) };
  delete copy.grant_id;
  return copy;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty();
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!serviceEnv()) return json({ allowed: false, reason: "unavailable" }, 503);

  const user = await userFromRequest(req);
  if (!user) return json({ allowed: false, reason: "sign_in" }, 401);

  const body = await readJson(req);
  const clipId = typeof body?.clip_id === "string" ? body.clip_id.trim() : "";
  if (!clipId || clipId.length > 200) return json({ allowed: false, reason: "unavailable" }, 400);

  try {
    const result = await callRpc("consume_export", { p_user_id: user.id, p_clip_id: clipId });
    return json(publicBody(result));
  } catch (error) {
    console.error("consume_export", error instanceof Error ? error.message : "failed");
    return json({ allowed: false, reason: "unavailable" }, 502);
  }
});
