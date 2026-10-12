// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { createElement as h, type ReactNode } from "react";

/**
 * Announcement bar — admin-managed rotating messages (Admin → Settings). Custom `messages` rotate and
 * override the built-in defaults; an empty list falls back to the defaults (bar never blank); `hidden`
 * removes the bar; a valid `link` makes it clickable while stray text in the link field is ignored.
 */
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: new Proxy({}, { get: (_t, tag: string) => ({ className, children, href }: { className?: string; children?: ReactNode; href?: string }) => h(tag, { className, href }, children) }),
  useReducedMotion: () => true, // deterministic: static (first line), no rotation timer
}));

import { render, cleanup, screen } from "@testing-library/react";
import { AnnouncementBar } from "@/components/layout/AnnouncementBar";

const DEFAULT_FIRST = "Fragrance inspired by places, memories and everyday life";

afterEach(cleanup);

describe("AnnouncementBar — admin-managed messages", () => {
  it("no config → shows the built-in default lines", () => {
    render(h(AnnouncementBar, {}));
    expect(screen.getByText(DEFAULT_FIRST)).toBeTruthy();
  });

  it("empty messages list → still falls back to the defaults (never blank)", () => {
    render(h(AnnouncementBar, { announcement: { messages: [], link: "", hidden: false } }));
    expect(screen.getByText(DEFAULT_FIRST)).toBeTruthy();
  });

  it("custom messages → shows the admin's lines, not the defaults", () => {
    render(h(AnnouncementBar, { announcement: { messages: ["Festive dispatch by Oct 20", "Free gift wrap"], link: "", hidden: false } }));
    expect(screen.getByText("Festive dispatch by Oct 20")).toBeTruthy();
    expect(screen.queryByText(DEFAULT_FIRST)).toBeNull();
  });

  it("blank/whitespace lines are ignored (fall back to defaults if all blank)", () => {
    render(h(AnnouncementBar, { announcement: { messages: ["   ", ""], link: "", hidden: false } }));
    expect(screen.getByText(DEFAULT_FIRST)).toBeTruthy();
  });

  it("valid link → the bar line is a link to that href", () => {
    render(h(AnnouncementBar, { announcement: { messages: ["Shop the new chapter"], link: "/shop", hidden: false } }));
    const a = screen.getByText("Shop the new chapter") as HTMLAnchorElement;
    expect(a.tagName).toBe("A");
    expect(a.getAttribute("href")).toBe("/shop");
  });

  it("stray (non-URL) text in the link field is ignored → plain span, not a link", () => {
    render(h(AnnouncementBar, { announcement: { messages: ["Hello"], link: "Made in India · small batches", hidden: false } }));
    expect((screen.getByText("Hello") as HTMLElement).tagName).toBe("SPAN");
  });

  it("unsafe link scheme → ignored (plain span)", () => {
    render(h(AnnouncementBar, { announcement: { messages: ["Hi"], link: "javascript:alert(1)", hidden: false } }));
    expect((screen.getByText("Hi") as HTMLElement).tagName).toBe("SPAN");
  });

  it("hidden → renders nothing at all", () => {
    const { container } = render(h(AnnouncementBar, { announcement: { messages: ["Should not show"], link: "", hidden: true } }));
    expect(container.querySelector(".announcement-bar")).toBeNull();
    expect(screen.queryByText("Should not show")).toBeNull();
    expect(screen.queryByText(DEFAULT_FIRST)).toBeNull();
  });
});
