import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contentTypeFor, framePoint, magnifierSample, readTraicerApiBase, shotShape } from "./traicerApi.ts";

describe("readTraicerApiBase", () => {
  it("fails closed when the env var is missing or still the example", () => {
    const previous = process.env.NEXT_PUBLIC_TRAICER_API_URL;
    delete process.env.NEXT_PUBLIC_TRAICER_API_URL;
    assert.equal(readTraicerApiBase(), null);
    process.env.NEXT_PUBLIC_TRAICER_API_URL = "https://YOUR_API.example";
    assert.equal(readTraicerApiBase(), null);
    process.env.NEXT_PUBLIC_TRAICER_API_URL = "https://tracer.example/api/";
    assert.equal(readTraicerApiBase(), "https://tracer.example/api");
    if (previous === undefined) delete process.env.NEXT_PUBLIC_TRAICER_API_URL;
    else process.env.NEXT_PUBLIC_TRAICER_API_URL = previous;
  });
});

describe("framePoint", () => {
  it("ignores letterbox bars and uses the intrinsic frame", () => {
    const element = { left: 0, top: 0, width: 320, height: 180 };
    const point = framePoint(80, 90, element, 1920, 1080);
    assert.deepEqual(point, { x: 0.25, y: 0.5 });
    assert.equal(framePoint(10, 10, element, 1000, 1000), null);
  });

  it("uses CSS pixels, not device pixels", () => {
    const element = { left: 0, top: 100, width: 320, height: 180 };
    const css = framePoint(160, 190, element, 1920, 1080);
    assert.deepEqual(css, { x: 0.5, y: 0.5 });
    const devicePixelRatio = 2;
    const wronglyScaled = framePoint(160 * devicePixelRatio, 190 * devicePixelRatio, element, 1920, 1080);
    assert.notDeepEqual(wronglyScaled, css);
  });

  it("keeps a tap on the ball when the picture is letterboxed", () => {
    const element = { left: 0, top: 200, width: 390, height: 520 };
    const contentHeight = 390 / (16 / 9);
    const bar = (520 - contentHeight) / 2;
    const ballY = 200 + bar + contentHeight * 0.4;
    const point = framePoint(195, ballY, element, 1920, 1080);
    assert.ok(point);
    assert.ok(Math.abs(point.y - 0.4) < 0.001);
    const ignoredBar = (ballY - element.top) / element.height;
    assert.ok(Math.abs(ignoredBar - point.y) > 0.05);
    assert.equal(framePoint(195, ballY - 96, element, 1920, 1080), null);
  });

  it("ignores bars around a wide frame in a square box", () => {
    const element = { left: 100, top: 50, width: 400, height: 400 };
    assert.equal(framePoint(200, 60, element, 1600, 900), null);
    assert.deepEqual(framePoint(100, 250, element, 1600, 900), { x: 0, y: 0.5 });
  });
});

describe("magnifierSample", () => {
  it("scales x and y by the same factor", () => {
    const sample = magnifierSample({ x: 0.5, y: 0.4 }, 1920, 1080, 640, 360, 160, 4);
    assert.ok(sample);
    assert.equal(sample.srcW, sample.srcH);
    const stretched = { srcW: 1920 / 4, srcH: 1080 / 4 };
    assert.notEqual(stretched.srcW, stretched.srcH);
    assert.ok(Math.abs(sample.srcW - 120) < 1e-9);
  });
});

describe("clips", () => {
  it("accepts mp4 and mov only", () => {
    assert.equal(contentTypeFor({ name: "a.MP4", type: "" }), "video/mp4");
    assert.equal(contentTypeFor({ name: "a.mov", type: "" }), "video/quicktime");
    assert.equal(contentTypeFor({ name: "a.webm", type: "video/webm" }), null);
  });

  it("names the nine shapes from high-draw to low-fade", () => {
    assert.equal(shotShape("high", "draw"), "high-draw");
    assert.equal(shotShape("low", "fade"), "low-fade");
    assert.equal(shotShape("mid", "straight"), "mid-straight");
  });
});
