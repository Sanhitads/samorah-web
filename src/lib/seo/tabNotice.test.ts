import { describe, it, expect } from "vitest";
import { setTabNotice, noticeFor, type TabNotices } from "./tabNotice";

describe("per-tab notice isolation (point 12 — cross-tab leakage fix)", () => {
  it("a notice set on one tab never appears on the other", () => {
    let s: TabNotices = {};
    s = setTabNotice(s, "redirects", { tone: "err", text: "from and to are required" });
    expect(noticeFor(s, "redirects")?.text).toMatch(/required/);
    expect(noticeFor(s, "seo")).toBeNull(); // the Meta-overrides tab stays clean
  });
  it("setting a notice on the other tab doesn't disturb the first", () => {
    let s: TabNotices = {};
    s = setTabNotice(s, "redirects", { tone: "ok", text: "Redirect saved." });
    s = setTabNotice(s, "seo", { tone: "ok", text: "SEO override saved." });
    expect(noticeFor(s, "redirects")?.text).toBe("Redirect saved.");
    expect(noticeFor(s, "seo")?.text).toBe("SEO override saved.");
  });
  it("clearing one tab leaves the other intact", () => {
    let s: TabNotices = { redirects: { tone: "ok", text: "a" }, seo: { tone: "err", text: "b" } };
    s = setTabNotice(s, "redirects", null);
    expect(noticeFor(s, "redirects")).toBeNull();
    expect(noticeFor(s, "seo")?.text).toBe("b");
  });
});
