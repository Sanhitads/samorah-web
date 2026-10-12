// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { createElement as h, type ReactNode } from "react";

/**
 * Announcement bar — Admin → Settings wiring. A custom message (active + text) OVERRIDES the curated
 * rotation and can be linked; otherwise the rotation shows so the bar is NEVER empty (no regression
 * for stores that haven't set one). Unsafe link schemes never render as a live link.
 */
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: new Proxy({}, { get: (_t, tag: string) => ({ className, children }: { className?: string; children?: ReactNode }) => h(tag, { className }, children) }),
  useReducedMotion: () => true, // deterministic: no rotation timer in tests
}));

import { render, cleanup, screen } from "@testing-library/react";
import { AnnouncementBar } from "@/components/layout/AnnouncementBar";

const ROTATION_FIRST = "Crafted to transform atmosphere into ritual";

afterEach(cleanup);

describe("AnnouncementBar — settings-driven content", () => {
  it("no announcement prop → shows the curated rotation (unchanged default)", () => {
    render(h(AnnouncementBar, {}));
    expect(screen.getByText(ROTATION_FIRST)).toBeTruthy();
  });

  it("active + text → shows the admin message, NOT the rotation", () => {
    render(h(AnnouncementBar, { announcement: { active: true, text: "Complimentary shipping over ₹1,499", link: "" } }));
    expect(screen.getByText("Complimentary shipping over ₹1,499")).toBeTruthy();
    expect(screen.queryByText(ROTATION_FIRST)).toBeNull();
  });

  it("active + text + link → renders a link to the (safe) href", () => {
    render(h(AnnouncementBar, { announcement: { active: true, text: "Shop the new chapter", link: "/shop" } }));
    const a = screen.getByText("Shop the new chapter") as HTMLAnchorElement;
    expect(a.tagName).toBe("A");
    expect(a.getAttribute("href")).toBe("/shop");
  });

  it("inactive (toggle off) → falls back to the rotation, never hides the bar", () => {
    render(h(AnnouncementBar, { announcement: { active: false, text: "Hidden draft", link: "" } }));
    expect(screen.getByText(ROTATION_FIRST)).toBeTruthy();
    expect(screen.queryByText("Hidden draft")).toBeNull();
  });

  it("active but empty text → falls back to the rotation", () => {
    render(h(AnnouncementBar, { announcement: { active: true, text: "   ", link: "" } }));
    expect(screen.getByText(ROTATION_FIRST)).toBeTruthy();
  });

  it("unsafe link scheme → text renders as a plain span, not a live link", () => {
    render(h(AnnouncementBar, { announcement: { active: true, text: "Bad link", link: "javascript:alert(1)" } }));
    const el = screen.getByText("Bad link");
    expect(el.tagName).toBe("SPAN");
  });

  it("hidden → renders nothing at all (bar removed)", () => {
    const { container } = render(h(AnnouncementBar, { announcement: { hidden: true, active: true, text: "Should not show", link: "" } }));
    expect(container.querySelector(".announcement-bar")).toBeNull();
    expect(screen.queryByText("Should not show")).toBeNull();
    expect(screen.queryByText(ROTATION_FIRST)).toBeNull();
  });
});
