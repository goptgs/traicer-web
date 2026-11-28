import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { pricingTiers } from "./pricing.ts";

describe("pricing tiers", () => {
  it("keeps the draft packs in one config", () => {
    assert.deepEqual(
      pricingTiers.map((tier) => [tier.id, tier.priceUsd, tier.allowance]),
      [
        ["free", 0, "5 renders / month"],
        ["level-1", 9, "50 renders / month"],
        ["level-2", 19, "200 renders / month"],
        ["level-3", 39, "Unlimited"],
      ],
    );
    const level3 = pricingTiers.find((tier) => tier.id === "level-3");
    assert.equal(level3?.fairUse, "Fair use: 500 renders / month.");
  });
});

describe("AI Skill page", () => {
  it("does not show a price", () => {
    const files = ["src/app/skill/page.tsx", "src/components/EarlyAccessForm.tsx"];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      assert.equal(source.includes("$"), false, `${file} should not mention a price`);
      assert.equal(source.includes("pricing"), false, `${file} should not import pricing`);
    }
  });
});
