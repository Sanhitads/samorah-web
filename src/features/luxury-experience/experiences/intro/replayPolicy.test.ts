import { describe, it, expect } from "vitest";
import { resolveReplayRule, type ExperienceConfig } from "../../engine/config";
import { shouldReplay } from "./useIntroGate";

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

const base: ExperienceConfig = {
  enabled: true,
  experienceId: "default",
  experience: "intro",
  version: 1,
  replayPolicy: "version",
  replayAfterDays: 30,
  duration: 2600,
  brandMark: { kind: "text", text: "SAMORAH" },
  failsafeMs: 5000,
};
const cfg = (over: Partial<ExperienceConfig>): ExperienceConfig => ({ ...base, ...over });
const rule = (over: Partial<ExperienceConfig>) => resolveReplayRule(cfg(over));

describe("resolveReplayRule", () => {
  it("once → no version replay, no time replay", () => {
    expect(resolveReplayRule(cfg({ replayPolicy: "once" }))).toEqual({ versionKey: "1", replayOnVersion: false, replayDays: null });
  });
  it("version → version replay, no time replay", () => {
    expect(resolveReplayRule(cfg({ replayPolicy: "version" }))).toEqual({ versionKey: "1", replayOnVersion: true, replayDays: null });
  });
  it("version_or_days → version replay + day threshold", () => {
    expect(resolveReplayRule(cfg({ replayPolicy: "version_or_days", replayAfterDays: 30 }))).toEqual({ versionKey: "1", replayOnVersion: true, replayDays: 30 });
  });
});

describe("shouldReplay", () => {
  it("no record → always plays (every policy)", () => {
    for (const p of ["once", "version", "version_or_days"] as const) {
      expect(shouldReplay(rule({ replayPolicy: p }), null, NOW)).toBe(true);
    }
  });

  it("once: never replays after first view — not on version change, not over time", () => {
    const r = rule({ replayPolicy: "once", version: 2 });
    expect(shouldReplay(r, { v: 1, t: NOW - 999 * DAY }, NOW)).toBe(false);
  });

  it("version (default): replays only when the version changes", () => {
    expect(shouldReplay(rule({ version: 1 }), { v: 1, t: NOW }, NOW)).toBe(false); // same version
    expect(shouldReplay(rule({ version: 2 }), { v: 1, t: NOW }, NOW)).toBe(true); // bumped
    expect(shouldReplay(rule({ version: 1 }), { v: 1, t: NOW - 999 * DAY }, NOW)).toBe(false); // time ignored
  });

  it("version_or_days: replays on version change OR after the day threshold", () => {
    const r = rule({ replayPolicy: "version_or_days", replayAfterDays: 30, version: 1 });
    expect(shouldReplay(r, { v: 1, t: NOW }, NOW)).toBe(false); // same version, recent
    expect(shouldReplay(r, { v: 1, t: NOW - 31 * DAY }, NOW)).toBe(true); // elapsed
    expect(shouldReplay(r, { v: 1, t: NOW - 29 * DAY }, NOW)).toBe(false); // not yet
    expect(shouldReplay(rule({ replayPolicy: "version_or_days", version: 2 }), { v: 1, t: NOW }, NOW)).toBe(true); // bumped
  });

  it("backward compatible: a legacy string version compares equal to the numeric version", () => {
    expect(shouldReplay(rule({ version: 1 }), { v: "1", t: NOW }, NOW)).toBe(false);
  });
});
