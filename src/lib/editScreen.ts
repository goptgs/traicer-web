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

export function clipStatusLabel(input: {
  ball: boolean;
  impact: boolean;
  landing?: boolean;
  drafted: boolean;
  rendered: boolean;
}): string {
  if (input.rendered) return "Rendered";
  if (input.drafted) return "Drafted";
  if (input.landing) return "Landing set";
  if (input.impact) return "Impact set";
  if (input.ball) return "Ball set";
  return "Not started";
}

/** Why a landing tap must not be stored. Null means the clamped time is usable. */
export function landingTapDecision(input: {
  step: string;
  ready: boolean;
  showingResult: boolean;
  onPicture: boolean;
  impactTime: number | null;
  currentTime: number;
  duration: number;
}): { ok: true; landingTime: number } | { ok: false; reason: string } {
  if (!input.ready) return { ok: false, reason: "The frame is not ready yet." };
  if (input.showingResult) return { ok: false, reason: "The result is covering the picture." };
  if (input.step !== "ball" && input.step !== "landing") {
    return { ok: false, reason: `This step does not take a tap (${input.step}).` };
  }
  if (!input.onPicture) return { ok: false, reason: "That tap missed the picture." };
  if (input.step === "ball") return { ok: true, landingTime: input.currentTime };
  if (input.impactTime == null || !Number.isFinite(input.impactTime)) {
    return { ok: false, reason: "Set the impact before the landing." };
  }
  if (!Number.isFinite(input.currentTime)) return { ok: false, reason: "The playhead time is not a number." };
  const duration = Number.isFinite(input.duration) && input.duration > 0 ? input.duration : null;
  const landingTime = duration != null && input.currentTime > duration ? duration : input.currentTime;
  if (!(landingTime > input.impactTime + 0.001)) {
    return {
      ok: false,
      reason: `The landing (${landingTime.toFixed(2)} s) has to be after the impact (${input.impactTime.toFixed(2)} s).`,
    };
  }
  const hang = landingTime - input.impactTime;
  if (hang > 10) {
    return { ok: false, reason: `Hang time would be ${hang.toFixed(1)} s. The maximum is 10 s.` };
  }
  return { ok: true, landingTime };
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
