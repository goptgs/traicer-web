import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  arcPoints,
  clampHandles,
  draft,
  dragApex,
  dragEnd,
  type ArcModel,
} from "./traicerArc.ts";

const WIDTH = 1920;
const HEIGHT = 1080;

function nearPx(actual: number, expected: number, axis: "x" | "y") {
  const px = Math.abs(actual - expected) * (axis === "x" ? WIDTH : HEIGHT);
  assert.ok(px <= 0.5, `${axis} off by ${px.toFixed(3)} px (${actual} vs ${expected})`);
}

function nearModel(actual: ArcModel, expected: Record<string, number>) {
  for (const [key, value] of Object.entries(expected)) {
    const axis = key.startsWith("y") || key === "T" || key === "TA" ? "y" : "x";
    if (key === "T" || key === "TA" || key === "launchTan" || key === "hangK" || key === "b" || key === "c") {
      assert.ok(Math.abs(actual[key as keyof ArcModel] as number - value) < 1e-9, key);
      continue;
    }
    nearPx(actual[key as keyof ArcModel] as number, value, axis === "y" && key.startsWith("y") ? "y" : "x");
  }
}

describe("traicer arc", () => {
  const impact = [0.42, 0.62, 1.2] as const;
  const model = draft(impact, [0.71, 0.78], 6.2, 0.12, 16 / 9);

  it("matches the reference draft within half a pixel", () => {
    nearModel(model, {
      xA: 0.563559332,
      yA: 0.2263199999999999,
      xE: 0.71,
      yE: 0.78,
      T: 6.2,
      TA: 3.472,
      b: 0.0344413306451613,
      launchTan: 0.12,
      hangK: 9.88143489264046,
    });
    const pts = arcPoints(model, 5);
    const expected = [
      [0.0, 0.42, 0.62],
      [1.55, 0.478163046875, 0.2538258362226173],
      [3.1, 0.5458840625, 0.22633698157068646],
      [4.65, 0.623163046875, 0.32956301652892556],
      [6.2, 0.71, 0.78],
    ];
    pts.forEach((row, index) => {
      nearPx(row[1], expected[index][1], "x");
      nearPx(row[2], expected[index][2], "y");
    });
  });

  it("clamps handles into the plausible range", () => {
    const [apex, end] = clampHandles(impact, [1.4, 0.01, 1.2 + 0.01], [-2, 1.5, 1.2 + 40], 16 / 9);
    nearPx(apex[0], 0.5609999999999999, "x");
    nearPx(apex[1], 0.02, "y");
    assert.ok(Math.abs(apex[2] - 2.7) < 1e-9);
    nearPx(end[0], 0.01, "x");
    nearPx(end[1], 0.99, "y");
    assert.ok(Math.abs(end[2] - 11.2) < 1e-9);
  });

  it("drag_apex changes the hang and drag_end moves the landing", () => {
    const apex = dragApex(model, 0.55, 0.28);
    nearPx(apex.xA, 0.55, "x");
    nearPx(apex.yA, 0.28, "y");
    assert.ok(Math.abs(apex.T - 5.7618171511032354) < 1e-9);
    nearPx(apex.xE, 0.71, "x");
    const end = dragEnd(model, 0.2, 0.9);
    nearPx(end.xE, 0.2, "x");
    nearPx(end.yE, 0.9, "y");
    assert.equal(end.T, model.T);
    nearPx(end.xA, 0.429667, "x");
    assert.equal(end.launchTan, model.launchTan);
    assert.equal(end.hangK, model.hangK);
  });
});
