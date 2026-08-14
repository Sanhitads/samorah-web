/**
 * First-visit gate for the intro. Client-only, localStorage-based (no cookies, no backend).
 * Stores `{ v: lastSeenVersion, t: lastSeenAt }`; the replay decision is driven by the config's
 * ReplayRule (version change and/or elapsed days). The pre-paint inline script in LuxuryExperience
 * mirrors `shouldReplay` exactly so the overlay is hidden before first paint for returning visitors
 * (no flash). `shouldReplay` is pure (now is injected) so the policy is unit-testable without a DOM.
 */
import { resolveReplayRule, type ExperienceConfig, type ReplayRule } from "../../engine/config";

export const INTRO_STORAGE_KEY = "samorah:lux-intro";

/** Persisted record. `v` may be a number (current) or a legacy string — compared as a string. */
export interface IntroSeen {
  v?: number | string;
  t?: number;
}

/** Pure replay decision: no record → play; otherwise replay only if a policy trigger fires. */
export function shouldReplay(rule: ReplayRule, seen: IntroSeen | null, now: number): boolean {
  if (!seen) return true;
  if (rule.replayOnVersion && String(seen.v) !== rule.versionKey) return true; // new version → replay
  if (rule.replayDays != null && now - (seen.t ?? 0) >= rule.replayDays * 86_400_000) return true; // elapsed → replay
  return false;
}

export function shouldPlayIntro(config: ExperienceConfig): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(INTRO_STORAGE_KEY);
    const seen = raw ? (JSON.parse(raw) as IntroSeen) : null;
    return shouldReplay(resolveReplayRule(config), seen, Date.now());
  } catch {
    return true; // unreadable storage → degrade to play, never throw
  }
}

export function markIntroSeen(config: ExperienceConfig): void {
  try {
    window.localStorage.setItem(INTRO_STORAGE_KEY, JSON.stringify({ v: config.version, t: Date.now() }));
  } catch {
    /* private mode / storage disabled — degrade to always-play, never throw */
  }
}
