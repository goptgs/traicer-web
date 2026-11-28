export const DRAFT_STORAGE_KEY = "traicer.drafts.v1";

type EditStep = "ball" | "impact" | "landing" | "render" | "shape";

export type DraftPoint = { x: number; y: number };

export type ClipDraft = {
  key: string;
  name: string;
  points: { ball: DraftPoint | null; impact: DraftPoint | null; landing: DraftPoint | null };
  impactTime: number | null;
  landingTime: number | null;
  hang: number;
  hangOverride: boolean;
  hangFitted: boolean;
  colour: string;
  portrait: boolean;
  step: EditStep;
};

type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export function draftKey(file: { name: string; size: number; lastModified: number }): string {
  return `${file.name}\n${file.size}\n${file.lastModified}`;
}

function isPoint(value: unknown): value is DraftPoint {
  if (!value || typeof value !== "object") return false;
  const point = value as { x?: unknown; y?: unknown };
  return typeof point.x === "number" && typeof point.y === "number";
}

function isStep(value: unknown): value is EditStep {
  return value === "ball" || value === "impact" || value === "landing" || value === "render" || value === "shape";
}

function isDraft(value: unknown): value is ClipDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<ClipDraft>;
  const points = draft.points;
  if (!points || typeof draft.key !== "string" || typeof draft.name !== "string") return false;
  if (!isStep(draft.step)) return false;
  return (
    (points.ball === null || isPoint(points.ball)) &&
    (points.impact === null || isPoint(points.impact)) &&
    (points.landing === null || isPoint(points.landing))
  );
}

export function readDrafts(storage: Store): ClipDraft[] {
  try {
    const raw = storage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDraft);
  } catch {
    return [];
  }
}

export function writeDrafts(storage: Store, drafts: ClipDraft[]): void {
  storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
}

export function upsertDraft(drafts: ClipDraft[], draft: ClipDraft): ClipDraft[] {
  return [...drafts.filter((item) => item.key !== draft.key), draft];
}

export function dropDraft(drafts: ClipDraft[], key: string): ClipDraft[] {
  return drafts.filter((item) => item.key !== key);
}
