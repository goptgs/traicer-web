export const DEFAULT_HANG = 6.5;
export const HANG_MIN = 0.1;
export const HANG_MAX = 10;
export const HANG_STEP = 0.1;
export const UNDO_MS = 10_000;

export type EditStep = "ball" | "impact" | "landing" | "render" | "shape";

const ORDER: EditStep[] = ["ball", "impact", "landing", "render", "shape"];

export function stepHang(value: number, steps: number): number {
  const next = Math.round((value + steps * HANG_STEP) * 10) / 10;
  return Math.min(HANG_MAX, Math.max(HANG_MIN, Number(next.toFixed(1))));
}

/** 6.5 s until a fit or an explicit adjustment. After that, the fitted or chosen value. */
export function hangReadout(input: { fitted: boolean; hangOverride: boolean; hang: number }): number {
  if (input.hangOverride || input.fitted) return stepHang(input.hang, 0);
  return DEFAULT_HANG;
}

/** 1 credit for 16:9, and 1 more when 9:16 is included. */
export function exportCredits(includePortrait: boolean): number {
  return includePortrait ? 2 : 1;
}

export function creditLabel(includePortrait: boolean): string {
  const credits = exportCredits(includePortrait);
  return credits === 1 ? "1 credit" : `${credits} credits`;
}

export function impactFrameDelta(shiftKey: boolean): number {
  return shiftKey ? 10 : 1;
}

export function isTapStep(step: EditStep): boolean {
  return step === "ball" || step === "landing";
}

export function backStep(step: EditStep): EditStep | null {
  const index = ORDER.indexOf(step);
  if (index <= 0) return null;
  return ORDER[index - 1];
}

export function canOpenStep(
  step: EditStep,
  clip: { ball: boolean; impact: boolean; landing: boolean; rendered: boolean },
): boolean {
  if (step === "ball") return true;
  if (step === "impact") return clip.ball;
  if (step === "landing") return clip.impact;
  if (step === "render") return clip.landing;
  return clip.rendered;
}

export function wrongClipActions(): readonly ["remove", "add"] {
  return ["remove", "add"];
}

export function viewportTooSmall(width: number, height: number): boolean {
  return width < 1280 || height < 720;
}

export type PrimaryAction =
  | "find"
  | "impact"
  | "render"
  | "update"
  | "export"
  | "retry-find"
  | "retry-render";

export type PrimaryButton = { label: string; enabled: boolean; action: PrimaryAction };

export function instruction(input: {
  step: EditStep;
  ballMissing?: boolean;
  renderFailed?: boolean;
  rendered?: boolean;
}): string {
  if (input.ballMissing) return "Tap near the ball, or retry the auto-find.";
  if (input.renderFailed) return "Your markings are safe.";
  if (input.step === "ball") return "We can find it automatically, and you can tap near the ball to speed it up.";
  if (input.step === "impact") return "Timeline only. Arrow keys move one frame. Shift moves ten.";
  if (input.step === "landing") return "Tap where the ball landed.";
  if (input.step === "shape") return "Drag the apex or the end, then Update curve.";
  if (input.rendered) return "Export is ready. Shape is optional.";
  return "Render when you are ready. It plays in this window.";
}

export function primaryButton(input: {
  step: EditStep;
  ballMissing?: boolean;
  renderFailed?: boolean;
  hasDraft?: boolean;
  rendered?: boolean;
  shapeDirty?: boolean;
  busy?: boolean;
}): PrimaryButton {
  if (input.ballMissing) return { label: "Retry", enabled: !input.busy, action: "retry-find" };
  if (input.renderFailed) return { label: "Retry", enabled: !input.busy, action: "retry-render" };
  if (input.step === "ball") return { label: "Finding…", enabled: false, action: "find" };
  if (input.step === "impact") return { label: "Set impact", enabled: !input.busy, action: "impact" };
  if (input.step === "shape" || input.shapeDirty) {
    return { label: "Update curve", enabled: Boolean(input.shapeDirty) && !input.busy, action: "update" };
  }
  if (input.rendered && input.step === "render") return { label: "Export", enabled: !input.busy, action: "export" };
  if (input.step === "landing") return { label: "Render", enabled: false, action: "render" };
  return { label: "Render", enabled: Boolean(input.hasDraft) && !input.busy, action: "render" };
}
