import { findEntitlement, serviceEnv, userFromRequest } from "../_shared/admin.ts";
import { isPaidPlanId, priceCatalog, type BillingInterval } from "../_shared/billing.ts";
import { empty, json, readJson, siteUrl } from "../_shared/http.ts";
import { readPriceEnv, stripeForm, stripeSecret } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty();
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!stripeSecret() || !serviceEnv()) return json({ error: "billing_unavailable" }, 503);

  const user = await userFromRequest(req);
  if (!user) return json({ error: "sign_in" }, 401);

  const body = await readJson(req);
  const plan = typeof body?.plan === "string" ? body.plan : "";
  const interval: BillingInterval | null =
    body?.interval === "year" ? "year" : body?.interval === "month" ? "month" : null;
  if (!isPaidPlanId(plan) || !interval) return json({ error: "invalid_plan" }, 400);

  const match = priceCatalog(readPriceEnv()).find((entry) => entry.plan === plan && entry.interval === interval);
  if (!match) return json({ error: "price_not_configured" }, 409);

  const row = await findEntitlement({ userId: user.id }).catch(() => null);
  const customerId = row && typeof row.stripe_customer_id === "string" ? row.stripe_customer_id : "";

  const site = siteUrl();
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("line_items[0][price]", match.priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("allow_promotion_codes", "true");
  params.set("client_reference_id", user.id);
  params.set("metadata[user_id]", user.id);
  params.set("subscription_data[metadata][user_id]", user.id);
  params.set("success_url", `${site}/account?billing=success`);
  params.set("cancel_url", `${site}/pricing?billing=cancelled`);
  if (customerId) params.set("customer", customerId);
  else if (user.email) params.set("customer_email", user.email);

  const session = await stripeForm("/v1/checkout/sessions", params);
  if (!session.ok) {
    const status = session.status === 503 ? 503 : 502;
    return json({ error: session.error === "billing_unavailable" ? "billing_unavailable" : "checkout_failed" }, status);
  }
  const url = typeof session.body.url === "string" ? session.body.url : "";
  if (!url) return json({ error: "checkout_failed" }, 502);
  return json({ url });
});
