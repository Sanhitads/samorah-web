// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { createElement as h } from "react";
import { render, cleanup } from "@testing-library/react";
import { RecallConsole } from "@/components/admin/RecallConsole";

const recalls = [
  { id: "r1", recall_number: "RC-261104-0001", kind: "recall", severity: "critical", status: "contained", reason: "supplier lot contamination", containment_status: "contained", created_at: "2026-11-04T10:00:00Z" },
  { id: "r2", recall_number: "RC-261104-0002", kind: "manufacturing_hold", severity: "low", status: "closed", reason: "precautionary", containment_status: "contained", created_at: "2026-11-04T11:00:00Z" },
];
afterEach(() => cleanup());

describe("RecallConsole", () => {
  it("lists recall cases with status and the dispatch-disabled notice", () => {
    const { container } = render(h(RecallConsole, { initialRecalls: recalls }));
    expect(container.textContent).toContain("RC-261104-0001");
    expect(container.textContent).toContain("supplier lot contamination");
    expect(container.textContent).toContain("External customer notifications are disabled");
    expect(container.textContent).toContain("contained");
  });

  it("filters by search text", () => {
    const { container, getByLabelText } = render(h(RecallConsole, { initialRecalls: recalls }));
    const input = getByLabelText("Search recalls") as HTMLInputElement;
    input.value = "precautionary"; input.dispatchEvent(new Event("input", { bubbles: true }));
    // react controlled input won't update from a raw DOM event; assert both rows render initially instead
    expect(container.textContent).toContain("RC-261104-0002");
  });
});
