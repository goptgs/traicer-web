import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contentTypeFor, framePoint, readTraicerApiBase, shotShape } from "./traicerApi.ts";

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

  it("ignores bars around a wide frame in a square box", () => {
    const element = { left: 100, top: 50, width: 400, height: 400 };
    assert.equal(framePoint(200, 60, element, 1600, 900), null);
    assert.deepEqual(framePoint(100, 250, element, 1600, 900), { x: 0, y: 0.5 });
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
