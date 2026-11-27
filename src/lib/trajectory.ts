export type TrailPoint = { frame: number; x: number; y: number; widthFactor: number };

export type Trajectory = {
  fps: number;
  impactTime: number;
  landingTime: number;
  hangTime: number;
  holdAfterLanding: number;
  fadeDuration: number;
  rows: TrailPoint[];
};

export function parseTrajectory(raw: unknown): Trajectory | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const frames = obj.frames;
  const rowsRaw = Array.isArray((frames as { rows?: unknown } | undefined)?.rows)
    ? (frames as { rows: unknown[] }).rows
    : Array.isArray(obj.rows)
      ? obj.rows
      : null;
  if (!rowsRaw) return null;
  const rows: TrailPoint[] = [];
  for (const row of rowsRaw) {
    if (!Array.isArray(row) || row.length < 3) continue;
    const frame = Number(row[0]);
    const x = Number(row[1]);
    const y = Number(row[2]);
    if (!Number.isFinite(frame) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    rows.push({
      frame,
      x,
      y,
      widthFactor: Number.isFinite(Number(row[3])) ? Number(row[3]) : 1,
    });
  }
  if (rows.length === 0) return null;
  return {
    fps: Number(obj.fps) > 0 ? Number(obj.fps) : 30,
    impactTime: Number(obj.impactTime) || 0,
    landingTime: Number(obj.landingTime) || 0,
    hangTime: Number(obj.hangTime) || 0,
    holdAfterLanding: Number(obj.holdAfterLanding ?? 1) || 1,
    fadeDuration: Number(obj.fadeDuration ?? 0.5) || 0.5,
    rows,
  };
}

/** Opacity of the whole trail. Holds, then fades with (1-u)^2. */
export function trailOpacity(
  time: number,
  landingTime: number,
  holdAfterLanding = 1,
  fadeDuration = 0.5,
): number {
  if (time <= landingTime + holdAfterLanding) return 1;
  if (fadeDuration <= 0) return 0;
  const u = (time - landingTime - holdAfterLanding) / fadeDuration;
  if (u >= 1) return 0;
  return (1 - u) * (1 - u);
}

export function rowsUntil(trajectory: Trajectory, time: number): TrailPoint[] {
  const frame = time * trajectory.fps;
  return trajectory.rows.filter((row) => row.frame <= frame + 0.001);
}
