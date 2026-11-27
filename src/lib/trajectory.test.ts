import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTrajectory, rowsUntil, trailOpacity } from "./trajectory.ts";

describe("trajectory", () => {
  it("reads normalised rows and the fade hold", () => {
    const parsed = parseTrajectory({
      fps: 30,
      impactTime: 1,
      landingTime: 4,
      hangTime: 3,
      holdAfterLanding: 1,
      fadeDuration: 0.5,
      frames: { rows: [[0, 0.1, 0.8, 1], [30, 0.5, 0.2, 1.2]] },
    });
    assert.ok(parsed);
    assert.equal(parsed.rows.length, 2);
    assert.equal(trailOpacity(4.5, parsed.landingTime, 1, 0.5), 1);
    assert.equal(trailOpacity(5.5, parsed.landingTime, 1, 0.5), 0);
    assert.equal(rowsUntil(parsed, 0.5).length, 1);
  });
});
