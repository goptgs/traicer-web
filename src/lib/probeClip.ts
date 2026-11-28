/** 60 second clip limit, matched to MAX_CLIP_SECONDS by the probe tests. */
const CLIP_LIMIT_SECONDS = 60;

/** How long to wait for a duration before accepting a clip whose length is still unknown. */
export const PROBE_WAIT_MS = 20_000;

export const CANT_PLAY_MESSAGE =
  "Your browser couldn't open this clip. Try Chrome, or re-export the video as MP4 (H.264).";

export type ProbeMediaState = {
  duration: number;
  readyState: number;
  videoWidth: number;
  errored: boolean;
  timedOut: boolean;
};

export type ProbeDecision =
  | { status: "accept"; duration: number | null }
  | { status: "reject"; reason: "too-long" | "cant-play" }
  | { status: "wait" };

function knownDuration(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function hasFrame(state: ProbeMediaState): boolean {
  return state.readyState >= 2 || state.videoWidth > 0;
}

/**
 * A missing duration is allowed: phone and DJI files often keep the moov atom
 * at the end, so WebKit may not know the length yet. Reject only a known
 * overrun, a media error, or metadata that never produces a frame.
 */
export function classifyProbe(state: ProbeMediaState): ProbeDecision {
  if (state.errored) return { status: "reject", reason: "cant-play" };
  const duration = knownDuration(state.duration);
  if (duration != null && duration > CLIP_LIMIT_SECONDS) return { status: "reject", reason: "too-long" };
  if (duration != null) return { status: "accept", duration };
  if (!state.timedOut) return { status: "wait" };
  if (state.readyState >= 1 && !hasFrame(state)) return { status: "reject", reason: "cant-play" };
  return { status: "accept", duration: null };
}

/** True when the element has failed, or has metadata but still no picture. */
export function playbackGaveUp(state: { readyState: number; videoWidth: number; errored: boolean }): boolean {
  if (state.errored) return true;
  const frame = state.readyState >= 2 || state.videoWidth > 0;
  return state.readyState >= 1 && !frame;
}

type ProbeVideo = {
  duration: number;
  readyState: number;
  videoWidth: number;
  error: unknown;
  preload: string;
  src: string;
  onloadedmetadata: (() => void) | null;
  onloadeddata: (() => void) | null;
  onerror: (() => void) | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  load(): void;
};

export type ProbeDeps = {
  waitMs?: number;
  createVideo?: () => ProbeVideo;
  createObjectURL?: (file: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  schedule?: (fn: () => void, ms: number) => number;
  clear?: (id: number) => void;
};

export function probeDuration(file: Blob, deps: ProbeDeps = {}): Promise<ProbeDecision> {
  const waitMs = deps.waitMs ?? PROBE_WAIT_MS;
  const createVideo = deps.createVideo ?? (() => document.createElement("video") as unknown as ProbeVideo);
  const createObjectURL = deps.createObjectURL ?? ((blob: Blob) => URL.createObjectURL(blob));
  const revokeObjectURL = deps.revokeObjectURL ?? ((url: string) => URL.revokeObjectURL(url));
  const schedule = deps.schedule ?? ((fn, ms) => window.setTimeout(fn, ms));
  const clear = deps.clear ?? ((id: number) => window.clearTimeout(id));

  return new Promise((resolve) => {
    const url = createObjectURL(file);
    const video = createVideo();
    video.setAttribute("playsinline", "");
    video.preload = "metadata";
    let settled = false;
    let errored = false;
    const timer = schedule(() => finish(true), waitMs);

    function finish(timedOut: boolean) {
      const decision = classifyProbe({
        duration: video.duration,
        readyState: video.readyState,
        videoWidth: video.videoWidth,
        errored: errored || Boolean(video.error),
        timedOut,
      });
      if (decision.status === "wait") return;
      if (settled) return;
      settled = true;
      clear(timer);
      revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      resolve(decision);
    }

    video.onloadedmetadata = () => finish(false);
    video.onloadeddata = () => finish(false);
    video.onerror = () => {
      errored = true;
      finish(false);
    };
    video.src = url;
  });
}
