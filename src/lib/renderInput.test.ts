import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderInput } from "./renderInput.ts";

describe("renderInput", () => {
  it("keeps landing and the cached ball, and drops the drag handles", () => {
    const body = renderInput(
      {
        outputs: [] as string[],
        color: "#2EE8FF",
        landing: { x: 0.71, y: 0.78 },
        ball: { x: 0.42, y: 0.62 },
        impactTime: 1.2,
        apex: { x: 0.55, y: 0.28, t: 4 },
        end: { x: 0.71, y: 0.78, t: 7 },
      },
      "fit-9",
      ["mp4", "mp4_9x16"],
    );
    const sent = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
    assert.deepEqual(sent.landing, { x: 0.71, y: 0.78 });
    assert.deepEqual(sent.ball, { x: 0.42, y: 0.62 });
    assert.equal(sent.impactTime, 1.2);
    assert.equal(sent.fitId, "fit-9");
    assert.deepEqual(sent.outputs, ["mp4", "mp4_9x16"]);
    assert.equal(sent.color, "#2EE8FF");
    assert.equal("apex" in sent, false);
    assert.equal("end" in sent, false);
  });
});
