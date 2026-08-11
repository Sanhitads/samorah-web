import { describe, it, expect } from "vitest";
import { groupBody, injectSupportEmail, splitClosing, SUPPORT_EMAIL_TOKEN, SUPPORT_UNAVAILABLE } from "@/lib/cms/pageContent";

describe("groupBody", () => {
  it("leaves plain paragraphs untouched (existing pages unaffected)", () => {
    expect(groupBody(["One.", "Two."])).toEqual([
      { type: "p", text: "One." },
      { type: "p", text: "Two." },
    ]);
  });

  it("groups consecutive '- ' lines into one list, stripping the marker", () => {
    const blocks = groupBody(["We may collect:", "- Name", "- Email", "You may disable cookies."]);
    expect(blocks).toEqual([
      { type: "p", text: "We may collect:" },
      { type: "list", items: ["Name", "Email"] },
      { type: "p", text: "You may disable cookies." },
    ]);
  });

  it("starts a new list after an interrupting paragraph", () => {
    const blocks = groupBody(["- A", "Break.", "- B"]);
    expect(blocks).toEqual([
      { type: "list", items: ["A"] },
      { type: "p", text: "Break." },
      { type: "list", items: ["B"] },
    ]);
  });

  it("also accepts the bullet character '•'", () => {
    expect(groupBody(["• X"])).toEqual([{ type: "list", items: ["X"] }]);
  });
});

describe("splitClosing", () => {
  it("extracts a trailing heading-less section as the closing", () => {
    const r = splitClosing([
      { heading: "Contact", body: ["Email x"] },
      { body: ["A quiet closing line."] },
    ]);
    expect(r.closing).toBe("A quiet closing line.");
    expect(r.sections).toHaveLength(1);
    expect(r.sections[0].heading).toBe("Contact");
  });

  it("leaves sections intact when the last one has a heading", () => {
    const secs = [{ heading: "Contact", body: ["Email x"] }];
    const r = splitClosing(secs);
    expect(r.closing).toBeUndefined();
    expect(r.sections).toBe(secs);
  });

  it("ignores an empty trailing section (not a closing)", () => {
    const r = splitClosing([{ heading: "A", body: ["x"] }, { body: ["  "] }]);
    expect(r.closing).toBeUndefined();
  });
});

describe("injectSupportEmail", () => {
  const sections = [
    { heading: "Contact", body: ["For any privacy-related concerns:", `Email: ${SUPPORT_EMAIL_TOKEN}`] },
    { heading: "Other", body: ["No token here."] },
  ];

  it("substitutes the resolved email from Site Settings", () => {
    const out = injectSupportEmail(sections, "help@samorah.test");
    expect(out[0].body[1]).toBe("Email: help@samorah.test");
    expect(out[1].body[0]).toBe("No token here."); // untouched
  });

  it("degrades to the graceful fallback when the email is empty", () => {
    expect(injectSupportEmail(sections, "")[0].body[1]).toBe(SUPPORT_UNAVAILABLE);
    expect(injectSupportEmail(sections, "   ")[0].body[1]).toBe(SUPPORT_UNAVAILABLE);
    expect(injectSupportEmail(sections, null)[0].body[1]).toBe(SUPPORT_UNAVAILABLE);
    expect(injectSupportEmail(sections, undefined)[0].body[1]).toBe(SUPPORT_UNAVAILABLE);
  });

  it("returns the same reference when no token is present (no needless work)", () => {
    const noToken = [{ heading: "A", body: ["plain"] }];
    expect(injectSupportEmail(noToken, "x@y.z")).toBe(noToken);
  });

  it("never leaks the raw token", () => {
    const out = injectSupportEmail(sections, "");
    expect(JSON.stringify(out)).not.toContain(SUPPORT_EMAIL_TOKEN);
  });
});
