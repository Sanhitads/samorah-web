// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { createElement as h } from "react";
import { FaqAccordion } from "@/components/faq/FaqAccordion";

afterEach(cleanup);

const CATS = [
  { category: "Orders", items: [{ q: "Q1?", a: "A1" }, { q: "Q2?", a: "line one\n- bullet a\n- bullet b" }] },
  { category: "Care", items: [{ q: "Q3?", a: "A3" }] },
];

describe("FaqAccordion — disclosure behaviour + a11y", () => {
  it("renders categories as H2 and questions as collapsed buttons (aria-expanded=false, +)", () => {
    const { container } = render(h(FaqAccordion, { categories: CATS }));
    expect(container.querySelectorAll("h2")).toHaveLength(2);
    const btns = container.querySelectorAll("button.faq__q");
    expect(btns).toHaveLength(3);
    btns.forEach((b) => expect(b.getAttribute("aria-expanded")).toBe("false"));
    expect([...container.querySelectorAll(".faq__icon")].every((i) => i.textContent === "+")).toBe(true);
    // each button controls its panel by id
    const first = btns[0];
    expect(container.querySelector(`#${first.getAttribute("aria-controls")}`)).toBeTruthy();
  });

  it("opening a question expands it (aria-expanded=true, −, panel data-open=1)", () => {
    const { container } = render(h(FaqAccordion, { categories: CATS }));
    const btns = container.querySelectorAll("button.faq__q");
    fireEvent.click(btns[0]);
    expect(btns[0].getAttribute("aria-expanded")).toBe("true");
    expect(btns[0].querySelector(".faq__icon")?.textContent).toBe("−");
    const panel = container.querySelector(`#${btns[0].getAttribute("aria-controls")}`);
    expect(panel?.getAttribute("data-open")).toBe("1");
    expect(panel?.getAttribute("aria-hidden")).toBe("false");
  });

  it("only one question is open at a time (opening a second closes the first)", () => {
    const { container } = render(h(FaqAccordion, { categories: CATS }));
    const btns = container.querySelectorAll("button.faq__q");
    fireEvent.click(btns[0]);
    fireEvent.click(btns[2]); // different category
    expect(btns[0].getAttribute("aria-expanded")).toBe("false");
    expect(btns[2].getAttribute("aria-expanded")).toBe("true");
  });

  it("clicking an open question closes it (toggle)", () => {
    const { container } = render(h(FaqAccordion, { categories: CATS }));
    const btn = container.querySelector("button.faq__q")!;
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it("multi-line answers render paragraphs and '- ' lines as a bullet list", () => {
    const { container } = render(h(FaqAccordion, { categories: CATS }));
    const btns = container.querySelectorAll("button.faq__q");
    fireEvent.click(btns[1]); // Q2 with a bullet answer
    const panel = container.querySelector(`#${btns[1].getAttribute("aria-controls")}`);
    expect(panel?.querySelectorAll("ul.legal__list li")).toHaveLength(2);
    expect(panel?.querySelector(".legal__p")?.textContent).toBe("line one");
  });
});
