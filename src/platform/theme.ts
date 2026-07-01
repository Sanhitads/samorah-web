/**
 * Theme Registry (§9) — the foundation of the Samorah design system.
 *
 * Responsibility: own the catalogue of themes and their visual tokens (colour
 * now; typography, spacing, motion, elevation, radius designed-for) and resolve
 * inheritance. A PURE domain model — it does NOT know CSS exists; the CSS is
 * derived by `themeStylesheet.ts`. Editorial Mood is NOT here (mood is content —
 * see `taxonomy.ts`). Framework-agnostic. Principles: Theme Tokens over Colours;
 * One Source of Truth; Domains remain independent.
 *
 * Phase-2 idea (not now): a theme could also expose component tokens
 * (button · card · input · divider · focus · badge · quote) so components never
 * decide styling. The `ThemeTokens` shape leaves room for it.
 */
import type { ThemeToken } from "./primitives";
import type { AssetRef } from "./asset";

// — Colour facet (the live one). Core required on a resolved theme; richer &
//   semantic tokens optional and growing. —
export interface ColorTokens {
  surface: string;
  surfaceAlt?: string;
  surfaceOverlay?: string;
  ink: string;
  inkSoft: string;
  inkMuted?: string;
  line: string;
  lineSoft?: string;
  accent: string; // owned by the theme — gold is the default, not a constant
  accentHover?: string;
  accentMuted?: string;
  success?: string;
  warning?: string;
  error?: string;
  focus?: string;
}

// — Future facets (designed-for; minimal today, the contract is ready). —
export interface TypographyTokens {
  fontPair?: string; // a serif/sans pairing id (e.g. "editorial" | "luxury")
}
export interface SpacingTokens {
  scale?: string;
}
export interface MotionTokens {
  duration?: string;
  ease?: string;
  reveal?: string;
}
export interface ElevationTokens {
  flat?: string;
  raised?: string;
  floating?: string;
}
export interface RadiusTokens {
  scale?: string;
}

export interface ThemeTokens {
  color: Partial<ColorTokens>; // partial: a child theme overrides only some
  typography?: TypographyTokens;
  spacing?: SpacingTokens;
  motion?: MotionTokens;
  elevation?: ElevationTokens;
  radius?: RadiusTokens;
}

export type ThemeCategory =
  | "core"
  | "seasonal"
  | "campaign"
  | "experimental"
  | "partner";

export interface Theme {
  token: ThemeToken;
  label: string;
  description?: string; // CMS metadata
  previewAsset?: AssetRef; // the CMS swatch — an Asset, never a URL
  category?: ThemeCategory;
  version?: number; // a theme can evolve (Warm Ivory v1 → v2) without breaking old content
  scheme: "light" | "dark";
  extends?: ThemeToken; // inheritance — reuse a base, override the rest
  tokens: ThemeTokens;
}

export const DEFAULT_THEME_TOKEN: ThemeToken = "warm-ivory";

// — Two roots; everything else inherits and overrides only what differs. —
const ROOT_LIGHT: ColorTokens = {
  surface: "#f5f0e8",
  ink: "#2a2a2a",
  inkSoft: "rgba(42, 42, 42, 0.72)",
  inkMuted: "rgba(42, 42, 42, 0.5)",
  line: "rgba(42, 42, 42, 0.12)",
  accent: "#c9a96e", // gold — the default accent
};
const ROOT_DARK: ColorTokens = {
  surface: "#15211b",
  ink: "#f2f4ee",
  inkSoft: "rgba(242, 244, 238, 0.72)",
  inkMuted: "rgba(242, 244, 238, 0.5)",
  line: "rgba(242, 244, 238, 0.16)",
  accent: "#c9a96e",
};

export const THEMES: Theme[] = [
  {
    token: "warm-ivory",
    label: "Warm Ivory",
    description: "The signature Samorah editorial palette.",
    category: "core",
    version: 1,
    scheme: "light",
    tokens: { color: ROOT_LIGHT },
  },
  {
    token: "sand",
    label: "Sand",
    description: "A warmer, deeper ivory.",
    category: "core",
    version: 1,
    scheme: "light",
    extends: "warm-ivory",
    tokens: { color: { surface: "#ece3d4" } },
  },
  {
    token: "clay",
    label: "Clay",
    description: "Warm brown — the Dessert chapters.",
    category: "core",
    version: 1,
    scheme: "light",
    extends: "warm-ivory",
    tokens: {
      color: {
        surface: "#e2d2c2",
        ink: "#3a2a20",
        inkSoft: "rgba(58, 42, 32, 0.72)",
        inkMuted: "rgba(58, 42, 32, 0.5)",
        line: "rgba(58, 42, 32, 0.14)",
      },
    },
  },
  {
    token: "monsoon",
    label: "Monsoon",
    description: "Cool grey light — rain. Silver accent.",
    category: "seasonal",
    version: 1,
    scheme: "light",
    extends: "warm-ivory",
    tokens: {
      color: {
        surface: "#dce0dd",
        ink: "#25302c",
        inkSoft: "rgba(37, 48, 44, 0.72)",
        inkMuted: "rgba(37, 48, 44, 0.5)",
        line: "rgba(37, 48, 44, 0.12)",
        accent: "#9aa7a3", // accent owned by the theme — not gold
      },
    },
  },
  {
    token: "winter",
    label: "Winter",
    description: "Cool pale light.",
    category: "seasonal",
    version: 1,
    scheme: "light",
    extends: "warm-ivory",
    tokens: {
      color: {
        surface: "#e7e9ec",
        ink: "#2a2e33",
        inkSoft: "rgba(42, 46, 51, 0.72)",
        inkMuted: "rgba(42, 46, 51, 0.5)",
        line: "rgba(42, 46, 51, 0.12)",
      },
    },
  },
  {
    token: "forest",
    label: "Forest",
    description: "Deep green — the Wild chapters.",
    category: "core",
    version: 1,
    scheme: "dark",
    tokens: { color: ROOT_DARK },
  },
  {
    token: "dark-library",
    label: "Dark Library",
    description: "Aubergine / deep plum — the Mood Library. Lavender-grey accent.",
    category: "core",
    version: 1,
    scheme: "dark",
    extends: "forest",
    tokens: {
      color: {
        surface: "#1e1a24",
        ink: "#faf7f2",
        inkSoft: "rgba(250, 247, 242, 0.72)",
        inkMuted: "rgba(250, 247, 242, 0.5)",
        line: "rgba(250, 247, 242, 0.16)",
        accent: "#b6aec6", // lavender grey — not gold
      },
    },
  },
  {
    token: "sage",
    label: "Sage",
    description: "Sage & moss — the Nature chapters. Soft-olive accent.",
    category: "core",
    version: 1,
    scheme: "dark",
    extends: "forest",
    tokens: {
      color: {
        surface: "#2c3528", // deep moss
        ink: "#f1f3ea",
        inkSoft: "rgba(241, 243, 234, 0.72)",
        inkMuted: "rgba(241, 243, 234, 0.5)",
        line: "rgba(241, 243, 234, 0.16)",
        accent: "#aeb98f", // soft olive
      },
    },
  },

  // — Air / The Hours: one atmosphere per hour (light, except Private Hours) —
  {
    token: "morning-blue",
    label: "Pale Morning Blue",
    description: "Open Window — first light.",
    category: "seasonal",
    version: 1,
    scheme: "light",
    extends: "warm-ivory",
    tokens: {
      color: {
        surface: "#dee4ea",
        ink: "#2a3138",
        inkSoft: "rgba(42, 49, 56, 0.72)",
        inkMuted: "rgba(42, 49, 56, 0.5)",
        line: "rgba(42, 49, 56, 0.12)",
        accent: "#8f9dae",
      },
    },
  },
  {
    token: "dusty-rose",
    label: "Dusty Rose",
    description: "Slow Evening — soft afternoon warmth.",
    category: "seasonal",
    version: 1,
    scheme: "light",
    extends: "warm-ivory",
    tokens: {
      color: {
        surface: "#e7dad7",
        ink: "#3a2e2d",
        inkSoft: "rgba(58, 46, 45, 0.72)",
        inkMuted: "rgba(58, 46, 45, 0.5)",
        line: "rgba(58, 46, 45, 0.12)",
        accent: "#b58f8b",
      },
    },
  },
  {
    token: "amber-hour",
    label: "Amber Hour",
    description: "After Dinner — the warmth that stays.",
    category: "seasonal",
    version: 1,
    scheme: "light",
    extends: "warm-ivory",
    tokens: {
      color: {
        surface: "#e9dfcb",
        ink: "#3a3121",
        inkSoft: "rgba(58, 49, 33, 0.72)",
        inkMuted: "rgba(58, 49, 33, 0.5)",
        line: "rgba(58, 49, 33, 0.12)",
        accent: "#b89a68",
      },
    },
  },
  {
    token: "deep-indigo",
    label: "Deep Indigo",
    description: "Private Hours — the last, quiet light.",
    category: "seasonal",
    version: 1,
    scheme: "dark",
    extends: "forest",
    tokens: {
      color: {
        surface: "#1b1f2e",
        ink: "#edeef4",
        inkSoft: "rgba(237, 238, 244, 0.72)",
        inkMuted: "rgba(237, 238, 244, 0.5)",
        line: "rgba(237, 238, 244, 0.16)",
        accent: "#9aa3c2",
      },
    },
  },
];

/** Indexed once for O(1) lookup (the exported API is unchanged). */
const THEME_INDEX: Map<ThemeToken, Theme> = new Map(
  THEMES.map((t) => [t.token, t] as const),
);

export interface ResolvedTheme {
  token: ThemeToken;
  scheme: "light" | "dark";
  color: ColorTokens;
  typography: TypographyTokens;
  spacing: SpacingTokens;
  motion: MotionTokens;
  elevation: ElevationTokens;
  radius: RadiusTokens;
}

export function getTheme(token: ThemeToken): Theme | undefined {
  return THEME_INDEX.get(token);
}

export function isDarkTheme(token: ThemeToken): boolean {
  return getTheme(token)?.scheme === "dark";
}

/** Resolve a theme by merging its `extends` chain (child overrides win). */
export function resolveTheme(
  token: ThemeToken,
  seen: Set<string> = new Set(),
): ResolvedTheme {
  const theme = getTheme(token) ?? getTheme(DEFAULT_THEME_TOKEN)!;
  const base =
    theme.extends && !seen.has(theme.extends)
      ? resolveTheme(theme.extends, new Set(seen).add(theme.token))
      : null;
  return {
    token: theme.token,
    scheme: theme.scheme,
    color: { ...(base?.color ?? {}), ...theme.tokens.color } as ColorTokens,
    typography: { ...(base?.typography ?? {}), ...(theme.tokens.typography ?? {}) },
    spacing: { ...(base?.spacing ?? {}), ...(theme.tokens.spacing ?? {}) },
    motion: { ...(base?.motion ?? {}), ...(theme.tokens.motion ?? {}) },
    elevation: { ...(base?.elevation ?? {}), ...(theme.tokens.elevation ?? {}) },
    radius: { ...(base?.radius ?? {}), ...(theme.tokens.radius ?? {}) },
  };
}
