import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_CLIP_SECONDS } from "./traicerApi.ts";
import {
  CANT_PLAY_MESSAGE,
  PROBE_WAIT_MS,
  classifyProbe,
  probeDuration,
  type ProbeMediaState,
} from "./probeClip.ts";

const base: ProbeMediaState = {
  duration: NaN,
  readyState: 0,
  videoWidth: 0,
  errored: false,
  timedOut: false,
};

describe("classifyProbe", () => {
  it("accepts a known duration within the limit", () => {
    assert.deepEqual(classifyProbe({ ...base, duration: 12, readyState: 1, videoWidth: 1920 }), {
      status: "accept",
      duration: 12,
    });
    assert.deepEqual(classifyProbe({ ...base, duration: 60, videoWidth: 100 }), {
      status: "accept",
      duration: 60,
    });
  });

  it("rejects only when the duration is known and over 60 seconds", () => {
    assert.equal(MAX_CLIP_SECONDS, 60);
    assert.deepEqual(classifyProbe({ ...base, duration: MAX_CLIP_SECONDS + 0.1, videoWidth: 1920 }), {
      status: "reject",
      reason: "too-long",
    });
  });

  it("accepts an unknown duration after the wait, which is the moov-at-end case", () => {
    assert.deepEqual(classifyProbe({ ...base, timedOut: true }), { status: "accept", duration: null });
    assert.deepEqual(classifyProbe({ ...base, duration: Infinity, timedOut: true }), {
      status: "accept",
      duration: null,
    });
  });

  it("rejects a media error with the re-export message path", () => {
    assert.deepEqual(classifyProbe({ ...base, errored: true, duration: 8 }), {
      status: "reject",
      reason: "cant-play",
    });
    assert.equal(
      CANT_PLAY_MESSAGE,
      "Your browser couldn't open this clip. Try Chrome, or re-export the video as MP4 (H.264).",
    );
  });

  it("rejects metadata that never produces a frame", () => {
    assert.deepEqual(classifyProbe({ ...base, timedOut: true, readyState: 1, videoWidth: 0 }), {
      status: "reject",
      reason: "cant-play",
    });
  });

  it("keeps waiting while the length is still unknown", () => {
    assert.equal(classifyProbe(base).status, "wait");
  });
});

describe("probeDuration", () => {
  function harness() {
    let scheduled: { fn: () => void; ms: number } | null = null;
    const video = {
      duration: NaN,
      readyState: 0,
      videoWidth: 0,
      error: null as unknown,
      preload: "",
      src: "",
      onloadedmetadata: null as (() => void) | null,
      onloadeddata: null as (() => void) | null,
      onerror: null as (() => void) | null,
      setAttribute() {},
      removeAttribute() {
        this.src = "";
      },
      load() {},
    };
    const pending = probeDuration(new Blob(["x"]), {
      createVideo: () => video,
      createObjectURL: () => "blob:clip",
      revokeObjectURL: () => {},
      schedule: (fn, ms) => {
        scheduled = { fn, ms };
        return 1;
      },
      clear: () => {},
    });
    return { video, pending, scheduled: () => scheduled };
  }

  it("waits about 20 seconds and then accepts an unknown duration", async () => {
    const { video, pending, scheduled } = harness();
    assert.equal(scheduled()?.ms, PROBE_WAIT_MS);
    assert.equal(PROBE_WAIT_MS, 20_000);
    video.duration = NaN;
    video.readyState = 0;
    scheduled()?.fn();
    assert.deepEqual(await pending, { status: "accept", duration: null });
  });

  it("does not fail the clip when metadata arrives with a usable length", async () => {
    const { video, pending } = harness();
    video.duration = 8;
    video.videoWidth = 1920;
    video.readyState = 1;
    video.onloadedmetadata?.();
    assert.deepEqual(await pending, { status: "accept", duration: 8 });
  });

  it("surfaces a decode error instead of a generic read failure", async () => {
    const { video, pending } = harness();
    video.error = { code: 4 };
    video.onerror?.();
    assert.deepEqual(await pending, { status: "reject", reason: "cant-play" });
  });
});
