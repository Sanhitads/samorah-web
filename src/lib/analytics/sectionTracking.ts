/**
 * Client-side section tracking (Phase 6 · point 26). Batches anonymous per-section events and ships
 * them via `navigator.sendBeacon` (fetch keepalive fallback) so they survive navigation. Everything is
 * consent-gated (`consentGranted()`), carries only an ephemeral per-tab session id, and fails silently.
 * Conversion attribution is last-touch: a homepage section CTA click stamps `sa_last_section`, which the
 * cart store reads on add-to-cart via `trackSectionConversion`.
 */
import { consentGranted } from "./consent";

const ENDPOINT = "/api/analytics/section";
const SID_KEY = "sa_sid";
const LAST_SECTION_KEY = "sa_last_section";

export interface SectionEvent {
  pageKey?: string; sectionId: string; sectionType?: string;
  eventType: "view" | "click" | "scroll" | "conversion"; scrollPct?: number;
}

function sessionId(): string {
  try {
    let id = sessionStorage.getItem(SID_KEY);
    if (!id) { id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`); sessionStorage.setItem(SID_KEY, id); }
    return id;
  } catch { return "anon"; }
}

function send(events: Array<Record<string, unknown>>) {
  if (!events.length) return;
  const payload = JSON.stringify({ events });
  try {
    const blob = new Blob([payload], { type: "application/json" });
    if (typeof navigator !== "undefined" && navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, blob)) return;
  } catch { /* fall through */ }
  try { void fetch(ENDPOINT, { method: "POST", body: payload, headers: { "Content-Type": "application/json" }, keepalive: true }); } catch { /* ignore */ }
}

let queue: Array<Record<string, unknown>> = [];
let timer: ReturnType<typeof setTimeout> | null = null;

/** Queue an event (batched + flushed after 3s or 20 events). No-op without consent. */
export function queueEvent(e: SectionEvent) {
  if (typeof window === "undefined" || !consentGranted()) return;
  queue.push({ ...e, pageKey: e.pageKey ?? "homepage", sessionId: sessionId(), path: location.pathname });
  if (queue.length >= 20) { flushNow(); return; }
  if (!timer) timer = setTimeout(flushNow, 3000);
}

/** Flush the queued events immediately (also called on page hide). */
export function flushNow() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (queue.length) send(queue.splice(0, queue.length));
}

/** Remember the last homepage section the visitor engaged with, for conversion attribution. */
export function setLastSection(id: string, type: string, pageKey = "homepage") {
  try { sessionStorage.setItem(LAST_SECTION_KEY, JSON.stringify({ id, type, pageKey })); } catch { /* ignore */ }
}

/** Attribute a conversion (add-to-cart) to the last section clicked, then clear it (one per journey). */
export function trackSectionConversion() {
  if (typeof window === "undefined" || !consentGranted()) return;
  try {
    const raw = sessionStorage.getItem(LAST_SECTION_KEY);
    if (!raw) return;
    const { id, type, pageKey } = JSON.parse(raw) as { id: string; type: string; pageKey: string };
    if (!id) return;
    send([{ pageKey: pageKey || "homepage", sectionId: id, sectionType: type, eventType: "conversion", sessionId: sessionId(), path: location.pathname }]);
    sessionStorage.removeItem(LAST_SECTION_KEY);
  } catch { /* ignore */ }
}
