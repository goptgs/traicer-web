import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stepFrames } from "./editorUx.ts";
import { draftKey, dropDraft, readDrafts, upsertDraft, writeDrafts, type ClipDraft } from "./clipDraft.ts";
import {
  DEFAULT_HANG,
  UNDO_MS,
  backStep,
  canOpenStep,
  creditLabel,
  exportCredits,
  hangReadout,
  impactFrameDelta,
  instruction,
  isTapStep,
  primaryButton,
  stepHang,
  viewportTooSmall,
  wrongClipActions,
} from "./editScreen.ts";

const ready = { ball: true, impact: true, landing: true, rendered: true };

describe("states", () => {
  it("1 find ball offers automatic detection and does not ask for a tap button", () => {
    assert.equal(
      instruction({ step: "ball" }),
      "We can find it automatically, and you can tap near the ball to speed it up.",
    );
    assert.deepEqual(primaryButton({ step: "ball" }), { label: "Finding…", enabled: false, action: "find" });
    assert.equal(isTapStep("ball"), true);
  });

  it("2 impact is timeline only, one native frame or ten with Shift", () => {
    assert.equal(isTapStep("impact"), false);
    assert.equal(primaryButton({ step: "impact" }).label, "Set impact");
    assert.equal(impactFrameDelta(false), 1);
    assert.equal(impactFrameDelta(true), 10);
    const fps = 30000 / 1001;
    const start = 12.5 / fps;
    assert.ok(Math.abs(stepFrames(start, fps, impactFrameDelta(false)) - start - 1 / fps) < 1e-6);
    assert.ok(Math.abs(stepFrames(start, fps, impactFrameDelta(true)) - start - 10 / fps) < 1e-6);
  });

  it("3 landing is a tap and does not render by itself", () => {
    const button = primaryButton({ step: "landing", hasDraft: false });
    assert.equal(button.label, "Render");
    assert.equal(button.enabled, false);
    assert.equal(isTapStep("landing"), true);
    assert.match(instruction({ step: "landing" }), /landed/);
  });

  it("4 render stays manual until the draft exists", () => {
    assert.equal(primaryButton({ step: "render", hasDraft: false }).enabled, false);
    assert.equal(primaryButton({ step: "render", hasDraft: true }).enabled, true);
    assert.equal(primaryButton({ step: "render", hasDraft: true }).label, "Render");
  });

  it("5 a finished render offers Export, with Shape optional", () => {
    assert.equal(primaryButton({ step: "render", hasDraft: true, rendered: true }).label, "Export");
    assert.match(instruction({ step: "render", rendered: true }), /Shape is optional/);
  });

  it("6 shape makes Update curve primary only after a drag", () => {
    assert.equal(primaryButton({ step: "shape", shapeDirty: false }).enabled, false);
    const dirty = primaryButton({ step: "shape", shapeDirty: true, hasDraft: true });
    assert.equal(dirty.label, "Update curve");
    assert.equal(dirty.enabled, true);
    assert.equal(primaryButton({ step: "render", hasDraft: true, shapeDirty: true }).label, "Update curve");
  });

  it("7 undo lasts 10 seconds", () => {
    assert.equal(UNDO_MS, 10_000);
  });

  it("9 ball not found retries without being a render", () => {
    const button = primaryButton({ step: "ball", ballMissing: true });
    assert.equal(button.label, "Retry");
    assert.equal(button.action, "retry-find");
    assert.match(instruction({ step: "ball", ballMissing: true }), /retry the auto-find/);
  });

  it("10 render failed keeps the retry on the markings message", () => {
    const button = primaryButton({ step: "render", renderFailed: true, hasDraft: true });
    assert.equal(button.action, "retry-render");
    assert.equal(instruction({ step: "render", renderFailed: true }), "Your markings are safe.");
  });

  it("11 back moves one step and a later step can still be opened", () => {
    assert.equal(backStep("impact"), "ball");
    assert.equal(backStep("landing"), "impact");
    assert.equal(backStep("render"), "landing");
    assert.equal(backStep("shape"), "render");
    assert.equal(backStep("ball"), null);
    assert.equal(canOpenStep("landing", ready), true);
    assert.equal(canOpenStep("shape", { ...ready, rendered: false }), false);
    assert.equal(canOpenStep("render", { ball: true, impact: true, landing: false, rendered: false }), false);
  });

  it("12 a wrong clip is removed or replaced by adding one, with no swap", () => {
    assert.deepEqual(wrongClipActions(), ["remove", "add"]);
  });
});

describe("hang time and export credits", () => {
  it("defaults the readout to 6.5s and then shows the fitted value", () => {
    assert.equal(DEFAULT_HANG, 6.5);
    assert.equal(hangReadout({ fitted: false, hangOverride: false, hang: 6.5 }), 6.5);
    assert.equal(hangReadout({ fitted: true, hangOverride: false, hang: 7.2 }), 7.2);
    assert.equal(hangReadout({ fitted: true, hangOverride: true, hang: 4.4 }), 4.4);
  });

  it("steps hang by a tenth between 0.1 and 10", () => {
    assert.equal(stepHang(6.5, 1), 6.6);
    assert.equal(stepHang(6.5, -1), 6.4);
    assert.equal(stepHang(0.1, -1), 0.1);
    assert.equal(stepHang(10, 1), 10);
  });

  it("charges 1 credit for 16:9 and 1 more for 9:16", () => {
    assert.equal(exportCredits(false), 1);
    assert.equal(exportCredits(true), 2);
    assert.equal(creditLabel(false), "1 credit");
    assert.equal(creditLabel(true), "2 credits");
  });
});

describe("viewport", () => {
  it("accepts 1280×720 and asks below that", () => {
    assert.equal(viewportTooSmall(1280, 720), false);
    assert.equal(viewportTooSmall(1280, 800), false);
    assert.equal(viewportTooSmall(1279, 720), true);
    assert.equal(viewportTooSmall(1280, 719), true);
  });
});

describe("clip drafts", () => {
  it("round-trips markings per file so a refresh can restore them", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => void memory.set(key, value),
    };
    const key = draftKey({ name: "swing.mp4", size: 1200, lastModified: 10 });
    const draft: ClipDraft = {
      key,
      name: "swing.mp4",
      points: { ball: { x: 0.4, y: 0.6 }, impact: null, landing: { x: 0.7, y: 0.8 } },
      impactTime: 1.2,
      landingTime: 4.4,
      hang: 7.1,
      hangOverride: false,
      hangFitted: true,
      colour: "#2EE8FF",
      portrait: true,
      step: "render",
    };
    writeDrafts(storage, upsertDraft(readDrafts(storage), draft));
    const restored = readDrafts(storage).find((item) => item.key === key);
    assert.deepEqual(restored, draft);
    writeDrafts(storage, dropDraft(readDrafts(storage), key));
    assert.equal(readDrafts(storage).length, 0);
  });
});
