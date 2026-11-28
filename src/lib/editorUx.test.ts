import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { advanceStep, frameCentre, removeClip, restoreClip, stepFrames } from "./editorUx.ts";

describe("stepFrames", () => {
  it("steps one frame at 29.97 and ten frames at 119.88", () => {
    const ntsc = 30000 / 1001;
    const high = 120000 / 1001;
    const start = frameCentre(12, ntsc);
    const next = stepFrames(start, ntsc, 1);
    assert.ok(Math.abs(next - frameCentre(13, ntsc)) < 1e-9);
    assert.ok(Math.abs(next - start - 1 / ntsc) < 1e-9);
    const wide = stepFrames(frameCentre(4, high), high, 10);
    assert.ok(Math.abs(wide - frameCentre(14, high)) < 1e-9);
    assert.ok(Math.abs(wide - frameCentre(4, high) - 10 / high) < 1e-9);
  });

  it("seeks to the frame centre and does not go before the first frame", () => {
    const fps = 24;
    assert.ok(Math.abs(stepFrames(0, fps, 1) - 1.5 / fps) < 1e-9);
    assert.ok(Math.abs(stepFrames(0.02, fps, -1) - 0.5 / fps) < 1e-9);
    const end = stepFrames(10, fps, 5, 1);
    assert.ok(end <= 1);
    assert.ok(Math.abs(end - frameCentre(23, fps)) < 1e-9);
  });
});

describe("clip list", () => {
  it("removes a clip and undo puts it back in place", () => {
    const clips = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const removed = removeClip(clips, "b", "b");
    assert.deepEqual(removed.clips.map((clip) => clip.id), ["a", "c"]);
    assert.equal(removed.selectedId, "c");
    assert.equal(removed.removed?.index, 1);
    const restored = restoreClip(removed.clips, removed.removed!);
    assert.deepEqual(restored.map((clip) => clip.id), ["a", "b", "c"]);
  });
});

describe("advanceStep", () => {
  it("moves from the ball to impact, then to landing", () => {
    assert.equal(advanceStep("ball", "ball"), "impact");
    assert.equal(advanceStep("impact", "impact"), "landing");
    assert.equal(advanceStep("landing", "ball"), "landing");
    assert.equal(advanceStep("shape", "impact"), "shape");
  });
});
