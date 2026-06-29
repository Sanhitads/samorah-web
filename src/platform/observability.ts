/**
 * Observability & adaptation (§20, §21) — events + personalization.
 *
 * Responsibility: the one seam through which meaningful interactions are emitted
 * (`emitEvent`), and the profile shape that lets pages adapt later. Models now;
 * sinks / activation are [Future]. Principle: Events over Guesswork.
 */
import type { TaxonomyRef } from "./taxonomy";

// — Event system (§21) —
export type EventType =
  | "viewed"
  | "clicked"
  | "opened"
  | "subscribed"
  | "purchased"
  | "shared"
  | "downloaded"
  | "campaign-opened";

export interface PlatformEvent {
  id: string;
  type: EventType;
  at: string; // ISO timestamp
  actor: { sessionId?: string; userId?: string };
  target: { type: string; id: string };
  context?: {
    experienceId?: string;
    journeyId?: string;
    pageId?: string;
    sectionId?: string;
    campaignId?: string;
    experimentId?: string;
  };
  meta?: Record<string, unknown>;
}

/**
 * The single emit seam. A no-op now; a real sink (GA4 / DB) wires in the
 * analytics phase. Components/sections call this instead of ad-hoc analytics.
 */
export function emitEvent(_event: PlatformEvent): void {
  // [Future] route to the analytics sink. Intentionally a no-op for now.
}

// — Personalization (§20): model now, activation later. —
export interface PersonalizationProfile {
  subjectId: string; // session or user
  preferredMoods?: TaxonomyRef[];
  preferredChapters?: string[];
  interestedCollections?: string[];
  previouslyViewed?: string[];
  recentlyVisited?: string[];
}
