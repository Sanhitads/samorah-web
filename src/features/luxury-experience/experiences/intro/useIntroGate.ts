/**
 * First-visit gate for the intro. Client-only, localStorage-based (no cookies, no backend).
 * Stores `{ v: version, t: timestamp }`; replays when the version changes (a major launch) or after
 * `replayAfterDays`. The pre-paint inline script in LuxuryExperience mirrors this exact logic so the
 * overlay is hidden before first paint for returning visitors (no flash).
 */
import type { ExperienceConfig } from "../../engine/config";

export const INTRO_STORAGE_KEY = "samorah:lux-intro";

export function shouldPlayIntro(config: ExperienceConfig): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(INTRO_STORAGE_KEY);
    if (!raw) return true;
    const seen = JSON.parse(raw) as { v?: string; t?: number };
    if (seen.v !== config.version) return true; // new version → replay
    if (config.replayAfterDays == null) return false; // play once, ever
    return Date.now() - (seen.t ?? 0) >= config.replayAfterDays * 86_400_000;
  } catch {
    return true;
  }
}

export function markIntroSeen(config: ExperienceConfig): void {
  try {
    window.localStorage.setItem(INTRO_STORAGE_KEY, JSON.stringify({ v: config.version, t: Date.now() }));
  } catch {
    /* private mode / storage disabled — degrade to always-play, never throw */
  }
}
