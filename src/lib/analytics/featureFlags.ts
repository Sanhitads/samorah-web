/**
 * Analytics widget feature flags. Every new analytics widget is independently toggleable so it can be
 * enabled/disabled without a code change. Resolution order (single seam — `resolveFlag`):
 *   1. explicit env override (ANALYTICS_ENABLED_WIDGETS / ANALYTICS_DISABLED_WIDGETS, comma-separated flags)
 *   2. the widget's declared default (from analyticsRegistry)
 * The env lists give deploy-config control today; a persistent/runtime toggle store can later plug into
 * `resolveFlag` without changing any call site. Server-read.
 */
const parseList = (v: string | undefined): Set<string> =>
  new Set((v ?? "").split(",").map((s) => s.trim()).filter(Boolean));

function overrides(): { enabled: Set<string>; disabled: Set<string> } {
  return {
    enabled: parseList(process.env.ANALYTICS_ENABLED_WIDGETS),
    disabled: parseList(process.env.ANALYTICS_DISABLED_WIDGETS),
  };
}

/** Resolve one flag: env override wins, else the declared default. */
export function resolveFlag(flag: string, defaultEnabled: boolean): boolean {
  const o = overrides();
  if (o.disabled.has(flag)) return false;
  if (o.enabled.has(flag)) return true;
  return defaultEnabled;
}
