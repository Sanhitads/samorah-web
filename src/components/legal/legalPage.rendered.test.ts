// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { createElement as h } from "react";
import { LegalPage } from "@/components/legal/LegalPage";
import { LEGAL } from "@/config/legalContent";

/** Accessibility + rendering contract for the shared policy renderer (Privacy uses it). */
afterEach(cleanup);

const privacy = LEGAL.privacy;

describe("LegalPage — accessibility & structure", () => {
  it("renders exactly one H1 (the page title) and an H2 per titled section", () => {
    const { container } = render(h(LegalPage, { eyebrow: privacy.eyebrow, title: privacy.title, intro: privacy.intro, sections: privacy.sections }));
    const h1s = container.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe("Privacy Policy");
    const headedSections = privacy.sections.filter((s) => s.heading).length;
    expect(container.querySelectorAll("h2")).toHaveLength(headedSections);
    // Heading hierarchy: no H3+ jumps in this editorial layout.
    expect(container.querySelectorAll("h3,h4,h5,h6")).toHaveLength(0);
  });

  it("omits the eyebrow node when eyebrow is empty (hero = title + subtitle only)", () => {
    const { container } = render(h(LegalPage, { eyebrow: "", title: "T", intro: "sub", sections: [] }));
    expect(container.querySelector(".legal__eyebrow")).toBeNull();
  });

  it("renders '- ' body lines as a semantic <ul><li> list, marker stripped", () => {
    const { container } = render(h(LegalPage, { eyebrow: "", title: "T", sections: [
      { heading: "Collect", body: ["We may collect:", "- Name", "- Email"] },
    ] }));
    const lis = container.querySelectorAll("ul.legal__list li");
    expect(lis).toHaveLength(2);
    expect(Array.from(lis).map((li) => li.textContent)).toEqual(["Name", "Email"]);
    // The lead-in line stays a paragraph, not a list item.
    expect(container.querySelector(".legal__p")?.textContent).toBe("We may collect:");
  });

  it("renders a heading-less section (the closing statement) as a plain paragraph", () => {
    const { container } = render(h(LegalPage, { eyebrow: "", title: "T", sections: [
      { body: ["A quiet closing line."] },
    ] }));
    expect(container.querySelectorAll("h2")).toHaveLength(0);
    expect(container.querySelector(".legal__section .legal__p")?.textContent).toBe("A quiet closing line.");
  });

  it("shows the footNote (Last updated line) when provided", () => {
    const { container } = render(h(LegalPage, { eyebrow: "", title: "T", sections: [], footNote: "Last updated 11 August 2026" }));
    expect(container.querySelector(".legal__foot")?.textContent).toBe("Last updated 11 August 2026");
  });

  it("renders the Effective / Last-updated metadata line from props", () => {
    const { container } = render(h(LegalPage, { eyebrow: "", title: "T", sections: [], effectiveDate: "1 August 2026", lastUpdated: "11 August 2026" }));
    const meta = container.querySelector(".legal__meta");
    expect(meta?.textContent).toContain("Effective 1 August 2026");
    expect(meta?.textContent).toContain("Last updated 11 August 2026");
  });

  it("renders the closing statement as a plain paragraph signature (no heading, no decoration)", () => {
    const { container } = render(h(LegalPage, { eyebrow: "", title: "T", sections: [{ heading: "Contact", body: ["x"] }], closing: "A quiet closing line." }));
    const closing = container.querySelector(".legal__closing");
    expect(closing?.tagName).toBe("P");
    expect(closing?.textContent).toBe("A quiet closing line.");
    expect(container.querySelectorAll("h2")).toHaveLength(1); // closing adds no heading
  });
});
