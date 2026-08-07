/**
 * Bundle CMS Phase 2A-1 — pure decision for the in-app unsaved-navigation guard.
 *
 * This mirrors the established component-local pattern in PageBuilder.tsx (a document-level
 * capture-phase click listener), factored out as a pure function so the anchor-decision matrix
 * is unit-testable without a DOM. The BundleEditor wires it into a `click` listener and only
 * consults it while the editor is genuinely dirty (isDirty(st) — the frozen unsaved authority).
 *
 * A click is guarded ONLY when it is a real in-app navigation to a different path:
 *   - primary button, no modifier keys (Ctrl/Cmd/Shift/Alt) → modified/new-tab clicks open a new
 *     context and never discard the current draft, so they are left to normal browser behavior;
 *   - a resolvable same-origin anchor with an href that is not a hash, not target=_blank, not a
 *     download, and whose pathname differs from the current one.
 * Everything else returns false (no prompt).
 */
export interface NavClickInput {
  /** MouseEvent.button — 0 is primary; anything else (middle/right) is not a plain navigation. */
  button: number;
  /** MouseEvent.metaKey || ctrlKey || shiftKey || altKey — a modified click (new tab/window). */
  modified: boolean;
  /** The anchor's raw href attribute (a.getAttribute("href")) — null when absent. */
  rawHref: string | null;
  /** The anchor's resolved absolute href (a.href). */
  absoluteHref: string;
  /** The anchor's target attribute, if any. */
  target: string | null;
  /** Whether the anchor carries a download attribute. */
  download: boolean;
}

export interface NavLocation {
  origin: string;
  pathname: string;
}

/** True when the click should trigger the unsaved-changes confirmation. Pure; no DOM access. */
export function shouldGuardNavigation(input: NavClickInput, current: NavLocation): boolean {
  if (input.button !== 0) return false; // non-primary (middle/right) button
  if (input.modified) return false; // Ctrl/Cmd/Shift/Alt — new tab/window/download, not a leave
  const href = input.rawHref;
  if (!href || href.startsWith("#") || input.target === "_blank" || input.download) return false;
  let url: URL;
  try {
    url = new URL(input.absoluteHref);
  } catch {
    return false;
  }
  if (url.origin !== current.origin) return false; // external — browser leaves the app anyway
  if (url.pathname === current.pathname) return false; // same page (e.g. query/hash-only)
  return true;
}
