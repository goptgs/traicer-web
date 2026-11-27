import { priceCatalog } from "../_shared/billing.ts";
import { empty, json } from "../_shared/http.ts";
import { readPriceEnv } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty();
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const catalog = priceCatalog(readPriceEnv());
  return json({
    monthly: catalog.filter((entry) => entry.interval === "month").map((entry) => entry.plan),
    annual: catalog.filter((entry) => entry.interval === "year").map((entry) => entry.plan),
  });
});
