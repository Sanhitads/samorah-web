// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { createElement as h, type FC } from "react";

/**
 * Bundle CMS Phase 2A — rendered proofs for the two launch-UX protections:
 *   2A-1  in-app unsaved-navigation guard (capture-phase click → window.confirm), driven solely by
 *         the editor dirty state; includes the Reset and failed-Save boundary requirements.
 *   2A-2  Restore+Publish confirmation gating the existing canonical restore.publish action.
 * Only leaf presentational deps are mocked; the real BundleEditor + preview render.
 */
vi.mock("framer-motion", () => {
  const cache: Record<string, FC<{ className?: string; children?: React.ReactNode }>> = {};
  return {
    motion: new Proxy({}, { get: (_t, k: string) => (cache[k] ??= ({ className, children }) => h("div", { className }, children)) }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useReducedMotion: () => true,
  };
});
vi.mock("@/components/ui/AssetImage", () => ({ AssetImage: ({ asset }: { asset: string }) => h("img", { src: asset, alt: "" }) }));

import { render, cleanup, fireEvent, screen, act } from "@testing-library/react";
import { BundleEditor } from "@/components/admin/BundleEditor";
import { DEFAULT_BUNDLE_CONFIG } from "@/lib/bundleConfig";
import type { BundleAdminState } from "@/services/bundleAdminService";
import type { BundleCandle } from "@/lib/bundle";

// jsdom lacks ResizeObserver (the preview stage uses it).
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

const candle = (id: string): BundleCandle => ({
  id, slug: id, name: `Name-${id}`, tagline: `tag-${id}`, chapter: null, edition: "",
  image: { url: `canonical://${id}`, alt: id },
  vessels: [{ vessel: "glass", variantId: `${id}-g`, size: "100g", price: 500, inStock: true }],
});
const CANDLES = [candle("a"), candle("b"), candle("c")];
const initial: BundleAdminState = { draft: DEFAULT_BUNDLE_CONFIG, published: DEFAULT_BUNDLE_CONFIG, status: "published", neverPublished: false };

// A sidebar-style in-app link injected into the document; the document-level capture guard sees it.
function addNavLink(href = "/admin/products") {
  const a = document.createElement("a");
  a.setAttribute("href", href);
  a.textContent = "Products";
  document.body.appendChild(a);
  return a;
}
// Dispatch a click that reaches the document capture listener. `prevent` neutralizes jsdom's
// (unimplemented) real navigation for tests that don't assert on defaultPrevented — the bubble-phase
// listener runs AFTER our capture guard, so it never affects the guard's own decision.
function clickAnchor(a: HTMLAnchorElement, opts: { button?: number; meta?: boolean; prevent?: boolean } = {}) {
  const { button = 0, meta = false, prevent = false } = opts;
  if (prevent) a.addEventListener("click", (e) => e.preventDefault(), { once: true });
  const ev = new MouseEvent("click", { bubbles: true, cancelable: true, button, metaKey: meta });
  a.dispatchEvent(ev);
  return ev;
}

const renderEditor = (canPublish = true) =>
  render(h(BundleEditor, { initial, candles: CANDLES, mediaUrls: {}, canPublish }));

// Make the editor dirty by editing the (uniquely-labeled) Hero heading field.
function makeDirty() {
  const heading = screen.getByLabelText("Heading (use a line break for two lines)", { selector: "textarea" }) as HTMLTextAreaElement;
  fireEvent.change(heading, { target: { value: `${heading.value} edited` } });
}

let fetchMock: ReturnType<typeof vi.fn>;
let confirmMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  confirmMock = vi.fn(() => true);
  vi.stubGlobal("confirm", confirmMock);
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const action = JSON.parse(String(init?.body ?? "{}")).action as string;
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
    if (action === "revisions") return ok({ revisions: [{ id: "r1", label: null, actorId: "staff-1", createdAt: "2026-08-01T10:30:00.000Z" }] });
    if (action === "load") return ok({ draft: DEFAULT_BUNDLE_CONFIG });
    if (action === "restore.publish") return ok({});
    if (action === "reset") return ok({});
    return ok({});
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); document.body.innerHTML = ""; vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("2A-1 — in-app unsaved-navigation guard", () => {
  it("clean editor: navigating away does NOT prompt", () => {
    renderEditor();
    const a = addNavLink();
    clickAnchor(a, { prevent: true });
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("dirty editor: navigating away prompts; Cancel blocks the navigation (preventDefault)", () => {
    renderEditor();
    makeDirty();
    confirmMock.mockReturnValue(false); // user clicks Cancel
    const a = addNavLink();
    const ev = clickAnchor(a);
    expect(confirmMock).toHaveBeenCalledWith("You have unsaved Bundle changes. Leave without saving?");
    expect(ev.defaultPrevented).toBe(true); // navigation blocked → stays on /admin/bundles
  });

  it("dirty editor: Confirm allows the navigation (not prevented)", () => {
    renderEditor();
    makeDirty();
    confirmMock.mockReturnValue(true); // user clicks Leave
    const a = addNavLink();
    const ev = clickAnchor(a);
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("does not prompt for modified (new-tab) clicks even when dirty", () => {
    renderEditor();
    makeDirty();
    const a = addNavLink();
    clickAnchor(a, { meta: true, prevent: true });
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("boundary: failed Save Draft keeps the editor dirty → navigation still prompts", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const action = JSON.parse(String(init?.body ?? "{}")).action as string;
      if (action === "save") return { ok: false, status: 500, json: async () => ({ error: "save exploded" }) } as unknown as Response;
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    });
    renderEditor();
    makeDirty();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save draft" })); });
    await screen.findByText("save exploded"); // save failed
    const a = addNavLink();
    clickAnchor(a, { prevent: true });
    expect(confirmMock).toHaveBeenCalledWith("You have unsaved Bundle changes. Leave without saving?");
  });

  it("boundary: successful Reset clears dirty → navigation does NOT prompt", async () => {
    renderEditor();
    makeDirty();
    // Reset has its own confirm (the reset warning) → allow it; then the nav confirm must NOT fire.
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Reset draft to default" })); });
    await screen.findByText("Draft reset to default. Publish to make it live.");
    const resetPrompts = confirmMock.mock.calls.length;
    const a = addNavLink();
    clickAnchor(a, { prevent: true });
    // No ADDITIONAL confirm beyond the reset warning → the nav guard saw a clean editor.
    expect(confirmMock.mock.calls.length).toBe(resetPrompts);
  });
});

describe("2A-2 — Restore+Publish confirmation", () => {
  async function loadRevisions() {
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Load" })); });
    return screen.findByRole("button", { name: "Restore + publish" });
  }

  it("Cancel → zero restore.publish request and zero state mutation", async () => {
    renderEditor(true);
    const btn = await loadRevisions();
    fetchMock.mockClear();
    confirmMock.mockReturnValue(false); // Cancel
    await act(async () => { fireEvent.click(btn); });
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(confirmMock.mock.calls[0][0]).toContain("make it the LIVE Bundle page");
    expect(fetchMock).not.toHaveBeenCalled(); // no API call at all
  });

  it("Confirm → exactly one restore.publish request (existing canonical action)", async () => {
    renderEditor(true);
    const btn = await loadRevisions();
    fetchMock.mockClear();
    confirmMock.mockReturnValue(true); // Confirm
    await act(async () => { fireEvent.click(btn); });
    const restoreCalls = fetchMock.mock.calls.filter((c) => JSON.parse(String(c[1]?.body ?? "{}")).action === "restore.publish");
    expect(restoreCalls).toHaveLength(1);
    expect(JSON.parse(String(restoreCalls[0][1]?.body)).revisionId).toBe("r1");
  });

  it("confirmation names the revision using the admin timestamp format", async () => {
    renderEditor(true);
    const btn = await loadRevisions();
    confirmMock.mockReturnValue(false);
    await act(async () => { fireEvent.click(btn); });
    const msg = String(confirmMock.mock.calls.at(-1)?.[0]);
    // Same en-IN "02 Aug, 04:00 pm"-style formatting the revision list uses (month abbreviation present).
    expect(msg).toMatch(/Aug/);
  });
});
