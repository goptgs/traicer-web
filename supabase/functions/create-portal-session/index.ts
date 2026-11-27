import { findEntitlement, serviceEnv, userFromRequest } from "../_shared/admin.ts";
import { empty, json, siteUrl } from "../_shared/http.ts";
import { stripeForm, stripeSecret } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty();
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!stripeSecret() || !serviceEnv()) return json({ error: "billing_unavailable" }, 503);

  const user = await userFromRequest(req);
  if (!user) return json({ error: "sign_in" }, 401);

  const row = await findEntitlement({ userId: user.id }).catch(() => null);
  const customerId = row && typeof row.stripe_customer_id === "string" ? row.stripe_customer_id : "";
  if (!customerId) return json({ error: "no_customer" }, 409);

  const params = new URLSearchParams();
  params.set("customer", customerId);
  params.set("return_url", `${siteUrl()}/account`);

  const session = await stripeForm("/v1/billing_portal/sessions", params);
  if (!session.ok) {
    const status = session.status === 503 ? 503 : 502;
    return json({ error: "portal_failed" }, status);
  }
  const url = typeof session.body.url === "string" ? session.body.url : "";
  if (!url) return json({ error: "portal_failed" }, 502);
  return json({ url });
});
