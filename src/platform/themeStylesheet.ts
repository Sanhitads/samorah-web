/**
 * Theme stylesheet generator (§9) — derives CSS custom-property blocks from the
 * Theme Registry.
 *
 * Responsibility: read the registry and produce the `:root` + `[data-theme="…"]`
 * CSS, so the registry itself stays a pure domain model that doesn't know CSS
 * exists. Framework-agnostic (returns a string; the layout mounts it).
 * Principles: Domains remain independent; One Source of Truth.
 */
import {
  THEMES,
  DEFAULT_THEME_TOKEN,
  resolveTheme,
  type ColorTokens,
} from "./theme";

const COLOR_VAR: Record<keyof ColorTokens, string> = {
  surface: "--surface",
  surfaceAlt: "--surface-alt",
  surfaceOverlay: "--surface-overlay",
  ink: "--ink",
  inkSoft: "--ink-soft",
  inkMuted: "--ink-muted",
  line: "--line",
  lineSoft: "--line-soft",
  accent: "--accent",
  accentHover: "--accent-hover",
  accentMuted: "--accent-muted",
  success: "--success",
  warning: "--warning",
  error: "--error",
  focus: "--focus",
};

function colorDecl(c: ColorTokens): string {
  return (Object.keys(COLOR_VAR) as (keyof ColorTokens)[])
    .filter((k) => c[k] != null)
    .map((k) => `${COLOR_VAR[k]}:${c[k]}`)
    .join(";");
}

/**
 * The full theme stylesheet, generated from the registry. Mounted once in the
 * root layout. Adding/altering a theme is a registry change only — CSS follows.
 */
export function buildThemeStylesheet(): string {
  const root = `:root{${colorDecl(resolveTheme(DEFAULT_THEME_TOKEN).color)}}`;
  const blocks = THEMES.map(
    (t) => `[data-theme="${t.token}"]{${colorDecl(resolveTheme(t.token).color)}}`,
  ).join("\n");
  return `${root}\n${blocks}\n[data-theme]{background:var(--surface);color:var(--ink)}`;
}
