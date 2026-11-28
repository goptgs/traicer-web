export type MarkStep = "ball" | "impact" | "landing" | "shape";

/** Frame n is shown by seeking to its centre, (n + 0.5) / fps. */
export function frameIndex(time: number, fps: number): number {
  if (!(fps > 0) || !Number.isFinite(time) || time <= 0) return 0;
  return Math.max(0, Math.floor(time * fps + 1e-8));
}

export function frameCentre(index: number, fps: number): number {
  return (Math.max(0, index) + 0.5) / fps;
}

export function stepFrames(time: number, fps: number, delta: number, duration?: number): number {
  let index = frameIndex(time, fps) + delta;
  if (index < 0) index = 0;
  if (duration != null && duration > 0 && fps > 0) {
    const last = Math.max(0, Math.floor((duration - 1e-4) * fps));
    if (index > last) index = last;
  }
  return frameCentre(index, fps);
}

export function chooseFps(...candidates: Array<number | null | undefined>): number {
  for (const value of candidates) {
    if (typeof value === "number" && value > 1 && value < 1000) return value;
  }
  return 30;
}

export function medianFps(deltas: number[]): number | null {
  const usable = deltas.filter((delta) => delta > 1 / 1000 && delta < 0.5);
  if (usable.length < 2) return null;
  const sorted = [...usable].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)];
  return mid > 0 ? 1 / mid : null;
}

export function advanceStep(step: MarkStep, reason: "ball" | "impact"): MarkStep {
  if (reason === "ball" && step === "ball") return "impact";
  if (reason === "impact" && step === "impact") return "landing";
  return step;
}

export function removeClip<T extends { id: string }>(clips: T[], id: string, selectedId: string | null) {
  const index = clips.findIndex((clip) => clip.id === id);
  if (index < 0) return { clips, selectedId, removed: null as { clip: T; index: number } | null };
  const next = clips.filter((clip) => clip.id !== id);
  const selected = selectedId === id ? (next[index]?.id ?? next[index - 1]?.id ?? null) : selectedId;
  return { clips: next, selectedId: selected, removed: { clip: clips[index], index } };
}

export function restoreClip<T>(clips: T[], removed: { clip: T; index: number }): T[] {
  const next = clips.slice();
  const index = Math.min(Math.max(0, removed.index), next.length);
  next.splice(index, 0, removed.clip);
  return next;
}
