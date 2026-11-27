/** TrAIcer arc model v1. Port of traicer_arc.py. Coordinates are normalised, origin top-left. */

export const MODEL = "traicer-arc-v1";
export const RISE_EXP = 4.5;
export const FALL_EXP = 2.0;
export const APEX_FRAC = 0.56;

export const LIMITS = {
  hangMin: 2.0,
  hangMax: 10.0,
  apexFracMin: 0.15,
  apexFracMax: 0.7,
  apexMinRise: 0.03,
  apexTop: 0.02,
  xMin: 0.01,
  xMax: 0.99,
  endYMin: 0.02,
  endYMax: 0.99,
  maxBulge: 0.6,
  maxLaunchTan: 0.45,
} as const;

export type Limits = { -readonly [K in keyof typeof LIMITS]: number };

export type Triple = readonly [number, number, number];

export type ArcModel = {
  model: string;
  x0: number;
  y0: number;
  t0: number;
  xA: number;
  yA: number;
  TA: number;
  xE: number;
  yE: number;
  T: number;
  b: number;
  c: number;
  d: number;
  riseExp: number;
  fallExp: number;
  launchTan: number;
  aspect: number;
  hangK: number | null;
};

export type CurveHandle = { x: number; y: number; t: number };

export type CurveHandles = { impact: CurveHandle; apex: CurveHandle; end: CurveHandle };

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function draftRise(hang: number): number {
  return clamp(0.3 + 0.065 * hang, 0.45, 0.75);
}

export function impliedHang(impact: Triple | readonly [number, number], apexY: number, hangK: number, lim: Limits = LIMITS): number {
  const rise = Math.max(1e-4, impact[1] - apexY);
  return clamp(hangK * Math.sqrt(rise), lim.hangMin, lim.hangMax);
}

export function clampHandles(impact: Triple, apex: Triple, end: Triple, aspect: number, lim: Limits = LIMITS): [Triple, Triple] {
  const [x0, y0, t0] = impact;
  const xE = clamp(end[0], lim.xMin, lim.xMax);
  const yE = clamp(end[1], lim.endYMin, lim.endYMax);
  const T = clamp(end[2] - t0, lim.hangMin, lim.hangMax);
  const yA = clamp(apex[1], lim.apexTop, Math.min(y0, yE) - lim.apexMinRise);
  const TA = clamp(apex[2] - t0, lim.apexFracMin * T, lim.apexFracMax * T);
  const u = TA / T;
  const xs = x0 + (xE - x0) * u;
  const bulge = (lim.maxBulge * (y0 - yA)) / aspect;
  const xA = clamp(clamp(apex[0], xs - bulge, xs + bulge), lim.xMin, lim.xMax);
  return [
    [xA, yA, t0 + TA],
    [xE, yE, t0 + T],
  ];
}

export function solve(
  impact: Triple,
  apex: Triple,
  end: Triple,
  launchTan: number,
  aspect: number,
  hangK: number | null = null,
  lim: Limits = LIMITS,
): ArcModel {
  const [clampedApex, clampedEnd] = clampHandles(impact, apex, end, aspect, lim);
  const [x0, y0, t0] = impact;
  const [xA, yA, tA] = clampedApex;
  const [xE, yE, tE] = clampedEnd;
  const T = tE - t0;
  const TA = tA - t0;
  const lt = clamp(launchTan, -lim.maxLaunchTan, lim.maxLaunchTan);
  const b = (lt * RISE_EXP * (y0 - yA)) / TA / aspect;
  const rA = xA - x0 - b * TA;
  const rE = xE - x0 - b * T;
  const det = TA * TA * T ** 3 - TA ** 3 * T * T;
  const c = (rA * T ** 3 - rE * TA ** 3) / det;
  const d = (TA * TA * rE - T * T * rA) / det;
  return {
    model: MODEL,
    x0,
    y0,
    t0,
    xA,
    yA,
    TA,
    xE,
    yE,
    T,
    b,
    c,
    d,
    riseExp: RISE_EXP,
    fallExp: FALL_EXP,
    launchTan: lt,
    aspect,
    hangK,
  };
}

export function pointAt(model: ArcModel, tau: number): [number, number] {
  const t = clamp(tau, 0, model.T);
  const x = model.x0 + t * (model.b + t * (model.c + t * model.d));
  const y =
    t <= model.TA
      ? model.yA + (model.y0 - model.yA) * (1 - t / model.TA) ** model.riseExp
      : model.yA + (model.yE - model.yA) * ((t - model.TA) / (model.T - model.TA)) ** model.fallExp;
  return [x, y];
}

export function arcPoints(model: ArcModel, n = 240): Array<[number, number, number]> {
  const rows: Array<[number, number, number]> = [];
  for (let i = 0; i < n; i += 1) {
    const tau = (model.T * i) / (n - 1);
    const [x, y] = pointAt(model, tau);
    rows.push([tau, x, y]);
  }
  return rows;
}

export function draft(impact: Triple, endXy: readonly [number, number], hang: number, launchTan: number, aspect: number, lim: Limits = LIMITS): ArcModel {
  const [x0, y0, t0] = impact;
  const T = clamp(hang, lim.hangMin, lim.hangMax);
  const room = y0 - lim.apexTop * 3;
  const yA = y0 - draftRise(T) * room;
  const TA = APEX_FRAC * T;
  const lt = clamp(launchTan, -lim.maxLaunchTan, lim.maxLaunchTan);
  const b = (lt * RISE_EXP * (y0 - yA)) / TA / aspect;
  const c = (endXy[0] - x0 - b * T) / (T * T);
  const xA = x0 + b * TA + c * TA * TA;
  const hangK = T / Math.sqrt(Math.max(1e-4, y0 - yA));
  return solve(impact, [xA, yA, t0 + TA], [endXy[0], endXy[1], t0 + T], launchTan, aspect, hangK, lim);
}

export function curveHandles(model: ArcModel): CurveHandles {
  return {
    impact: { x: model.x0, y: model.y0, t: model.t0 },
    apex: { x: model.xA, y: model.yA, t: model.t0 + model.TA },
    end: { x: model.xE, y: model.yE, t: model.t0 + model.T },
  };
}

export function dragApex(model: ArcModel, x: number, y: number, lim?: Limits): ArcModel {
  const bounds = lim ?? LIMITS;
  const hangK = model.hangK ?? 1;
  const T = impliedHang([model.x0, model.y0], y, hangK, bounds);
  const t0 = model.t0;
  return solve([model.x0, model.y0, t0], [x, y, t0 + APEX_FRAC * T], [model.xE, model.yE, t0 + T], model.launchTan, model.aspect, model.hangK, bounds);
}

export function dragEnd(model: ArcModel, x: number, y: number, lim?: Limits): ArcModel {
  const bounds = lim ?? LIMITS;
  const t0 = model.t0;
  return solve(
    [model.x0, model.y0, t0],
    [model.xA, model.yA, t0 + model.TA],
    [x, y, t0 + model.T],
    model.launchTan,
    model.aspect,
    model.hangK,
    bounds,
  );
}

export function launchTanFromTrack(impactPx: readonly [number, number], trackPx: Array<readonly [number, number, number]>): [number, number] {
  const [x0, y0] = impactPx;
  const pts = trackPx.filter((p) => p[0] > 0 && p[0] <= 0.25 && p[2] < y0 - 2);
  if (pts.length < 2) return [0, 0];
  const num = pts.reduce((sum, p) => sum + (p[1] - x0) * (y0 - p[2]), 0);
  const den = pts.reduce((sum, p) => sum + (y0 - p[2]) ** 2, 0);
  return [num / den, pts.length];
}

export function mergeLimits(raw: unknown): Limits {
  const next: Limits = { ...LIMITS };
  if (!raw || typeof raw !== "object") return next;
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(LIMITS) as Array<keyof Limits>) {
    const value = Number(obj[key]);
    if (Number.isFinite(value)) next[key] = value;
  }
  return next;
}

export function parseArcModel(raw: unknown): ArcModel | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const num = (key: string) => {
    const value = Number(obj[key]);
    return Number.isFinite(value) ? value : null;
  };
  const x0 = num("x0");
  const y0 = num("y0");
  const t0 = num("t0");
  const xA = num("xA");
  const yA = num("yA");
  const TA = num("TA");
  const xE = num("xE");
  const yE = num("yE");
  const T = num("T");
  const b = num("b");
  const c = num("c");
  const d = num("d");
  const launchTan = num("launchTan");
  const aspect = num("aspect");
  if ([x0, y0, t0, xA, yA, TA, xE, yE, T, b, c, d, launchTan, aspect].some((value) => value == null)) return null;
  const hang = num("hangK");
  return {
    model: typeof obj.model === "string" ? obj.model : MODEL,
    x0: x0 as number,
    y0: y0 as number,
    t0: t0 as number,
    xA: xA as number,
    yA: yA as number,
    TA: TA as number,
    xE: xE as number,
    yE: yE as number,
    T: T as number,
    b: b as number,
    c: c as number,
    d: d as number,
    riseExp: num("riseExp") ?? RISE_EXP,
    fallExp: num("fallExp") ?? FALL_EXP,
    launchTan: launchTan as number,
    aspect: aspect as number,
    hangK: hang,
  };
}

function readHandle(raw: unknown): CurveHandle | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { x?: unknown; y?: unknown; t?: unknown };
  const x = Number(obj.x);
  const y = Number(obj.y);
  const t = Number(obj.t);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(t)) return null;
  return { x, y, t };
}

export function readServerCurve(raw: unknown): {
  fitId: string | null;
  trackedFrames: number | null;
  impliedHang: number | null;
  handles: CurveHandles | null;
  limits: Limits | null;
  arcModel: ArcModel | null;
} {
  const empty = { fitId: null, trackedFrames: null, impliedHang: null, handles: null, limits: null, arcModel: null };
  if (!raw || typeof raw !== "object") return empty;
  const obj = raw as Record<string, unknown>;
  const tracked = Number(obj.trackedFrames);
  const implied = Number(obj.impliedHang);
  return {
    fitId: typeof obj.fitId === "string" ? obj.fitId : null,
    trackedFrames: Number.isFinite(tracked) ? tracked : null,
    impliedHang: Number.isFinite(implied) ? implied : null,
    handles: parseHandles(obj.handles),
    limits: obj.limits ? mergeLimits(obj.limits) : null,
    arcModel: parseArcModel(obj.arcModel),
  };
}

export function parseHandles(raw: unknown): CurveHandles | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { impact?: unknown; apex?: unknown; end?: unknown };
  const impact = readHandle(obj.impact);
  const apex = readHandle(obj.apex);
  const end = readHandle(obj.end);
  if (!impact || !apex || !end) return null;
  return { impact, apex, end };
}
