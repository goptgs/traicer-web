/** Render body: the API still validates landing. Apex and end are not sent; fitId selects the curve. */
export function renderInput<T extends { apex?: unknown; end?: unknown }>(
  draft: T,
  fitId: string,
  outputs: string[],
): Omit<T, "apex" | "end"> & { fitId: string; outputs: string[] } {
  return { ...draft, apex: undefined, end: undefined, fitId, outputs };
}
