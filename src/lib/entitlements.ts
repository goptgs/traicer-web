export type ExportDecision = { allowed: true } | { allowed: false; reason: string };

/**
 * Gate for Render and export. Auth and Stripe land in another branch;
 * until then every export is allowed. Keep this file tiny so it can be replaced.
 */
export function requestExport(_clipId: string): ExportDecision {
  return { allowed: true };
}
