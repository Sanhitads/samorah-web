import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Flame, type FlameProps } from "./Flame";

const render = (props: FlameProps = {}) => renderToStaticMarkup(createElement(Flame, props));

describe("Flame — decorative semantics", () => {
  it("is aria-hidden with no focusable/interactive nodes", () => {
    const html = render();
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/<a[\s>]|<button|tabindex/i);
  });
});

describe("Flame — CSS modifier application (no conditional render logic)", () => {
  it("defaults: classic variant + classic motion + default theme + glow + svg", () => {
    const html = render();
    expect(html).toContain("lux-flame--variant-classic");
    expect(html).toContain("lux-flame--theme-default");
    expect(html).toContain("lux-flame--classic"); // motionProfile
    expect(html).toContain("lux-flame__glow");
    expect(html).toContain("lux-flame__svg");
  });
  it("glow=false omits the glow layer", () => {
    expect(render({ glow: false })).not.toContain("lux-flame__glow");
  });
  it("sway=false adds the no-sway modifier", () => {
    expect(render({ sway: false })).toContain("lux-flame--no-sway");
  });
  it("passes an extra className through", () => {
    expect(render({ className: "on-hero" })).toContain("on-hero");
  });
});

describe("Flame — motionProfile class assignment", () => {
  it("still / classic / signature each map to their own class", () => {
    expect(render({ motionProfile: "still" })).toContain("lux-flame--still");
    expect(render({ motionProfile: "classic" })).toContain("lux-flame--classic");
    expect(render({ motionProfile: "signature" })).toContain("lux-flame--signature");
  });
});

describe("Flame — size handling", () => {
  it("named token → modifier class", () => {
    for (const s of ["xs", "sm", "md", "lg", "xl"] as const) {
      expect(render({ size: s })).toContain(`lux-flame--${s}`);
    }
  });
  it("numeric → inline height, no size modifier class", () => {
    const html = render({ size: 50 });
    expect(html).toMatch(/height:\s*50px/);
    expect(html).not.toMatch(/lux-flame--50/);
  });
});

describe("Flame — high-density (performance smoke)", () => {
  it("renders 100 simultaneous instances without error", () => {
    const many = renderToStaticMarkup(
      createElement(
        "div",
        null,
        Array.from({ length: 100 }, (_, i) => createElement(Flame, { key: i })),
      ),
    );
    expect((many.match(/lux-flame__svg/g) || []).length).toBe(100);
  });
});
