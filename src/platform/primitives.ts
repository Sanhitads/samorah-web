/**
 * Platform primitives — shared value types used across every domain.
 *
 * Responsibility: the small, framework-agnostic building blocks every domain
 * reuses — design-system version, theme tokens, editorial mood, envelope enums,
 * lifecycle status and schedule.
 *
 * Build-order step 2 (data models): types only — no engines, no UI, no logic.
 * See `docs/PAGE_ARCHITECTURE.md` (§2, §9, §18) and `docs/ARCHITECTURAL_PRINCIPLES.md`.
 */

/** An open string union — known members autocomplete; custom values (e.g. a
 *  campaign-specific theme token) are still allowed. */
type Open<T extends string> = T | (string & {});

export type Id = string;

// — Design System versioning (§2): a future redesign never breaks old pages. —
export interface DesignSystem {
  version: string; // overall system, e.g. "1.0.0"
  tokenVersion: string; // colour / spacing tokens
  componentVersion: string; // section / block / atom components
  typographyVersion: string; // type scale & fonts
}

export const CURRENT_DESIGN_SYSTEM: DesignSystem = {
  version: "1.0.0",
  tokenVersion: "1.0.0",
  componentVersion: "1.0.0",
  typographyVersion: "1.0.0",
};

// — Theme tokens (§9): named palettes; re-theme by reference, never hex. —
export type ThemeToken = Open<
  | "warm-ivory"
  | "dark-library"
  | "forest"
  | "sage"
  | "clay"
  | "sand"
  | "monsoon"
  | "winter"
>; // + "campaign-*" via Open

// — Editorial mood (§9): a feeling, carried for filtering & adaptation. —
export type EditorialMood = Open<
  | "quiet"
  | "morning"
  | "slow"
  | "warm"
  | "reflective"
  | "rain"
  | "forest"
  | "dessert"
  | "night"
  | "archive"
  | "celebration"
>;

// — Section envelope enums —
export type Spacing = "sm" | "md" | "lg" | "xl";
export type AnimationStyle = "none" | "fade" | "rise" | "settle";

// — Content lifecycle (§18): the editorial workflow. —
export type LifecycleStatus =
  | "draft"
  | "review"
  | "approved"
  | "scheduled"
  | "published"
  | "archived";

/** A schedule window. Fields exist now; cron activation is [Future]. */
export interface Schedule {
  publishAt?: string | null;
  startAt?: string | null;
  endAt?: string | null;
}

/** A validation problem — shared by section & template validation. */
export interface ValidationIssue {
  field?: string;
  message: string;
}
