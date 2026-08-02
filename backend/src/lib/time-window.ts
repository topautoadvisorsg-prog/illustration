/**
 * "N hours ago" as a Date, for the diagnostics repos' windowed aggregate
 * queries (error-events, operation-events, render-diagnostics). One shared
 * definition instead of each repo file computing it independently.
 */
export function windowSince(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}
