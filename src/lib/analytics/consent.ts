/**
 * Cookie consent (review point 10). Analytics must not fire before the visitor grants
 * consent. State is persisted per-browser and broadcast so the loader + facade react
 * live to Accept/Decline. Default is "unset" → nothing loads, nothing fires.
 */
import type { ConsentState } from "./types";

const KEY = "samorah_consent";
const EVENT = "samorah:consent";

/** Read the stored choice. SSR-safe (returns "unset" on the server). */
export function getConsent(): ConsentState {
  if (typeof window === "undefined") return "unset";
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "granted" || v === "denied" ? v : "unset";
  } catch {
    return "unset";
  }
}

/** Persist a choice and notify listeners (the loader loads scripts; the facade flushes). */
export function setConsent(state: Exclude<ConsentState, "unset">): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, state);
  } catch {
    /* private mode — consent lives for this session only */
  }
  window.dispatchEvent(new CustomEvent<ConsentState>(EVENT, { detail: state }));
}

/** Subscribe to consent changes. Returns an unsubscribe fn. */
export function onConsentChange(cb: (state: ConsentState) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => cb((e as CustomEvent<ConsentState>).detail ?? getConsent());
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

export const consentGranted = (): boolean => getConsent() === "granted";
