// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { createElement as h } from "react";
import { ProviderConnectionTest } from "@/components/admin/ProviderConnectionTest";
import { connectionResult, type ConnectionOutcome } from "@/lib/settings/connectionTest";

/** S2B — the connection test clearly distinguishes all five outcomes (label + severity). */
const mockFetchOk = (outcome: ConnectionOutcome) =>
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => connectionResult(outcome) })));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const CASES: { outcome: ConnectionOutcome; label: RegExp; sev: string }[] = [
  { outcome: "connected", label: /Connected/, sev: "healthy" },
  { outcome: "auth_failed", label: /Authentication failed/, sev: "critical" },
  { outcome: "config_missing", label: /Configuration missing/, sev: "critical" },
  { outcome: "unavailable", label: /Provider unavailable/, sev: "warning" },
  { outcome: "timeout", label: /Timeout/, sev: "warning" },
];

describe("ProviderConnectionTest — five-state matrix (S2B)", () => {
  for (const c of CASES) {
    it(`renders "${c.outcome}" with the right label + severity`, async () => {
      mockFetchOk(c.outcome);
      const { container, getByRole } = render(h(ProviderConnectionTest));
      fireEvent.click(getByRole("button"));
      await waitFor(() => expect(container.querySelector(".int-conn")).toBeTruthy());
      const el = container.querySelector(".int-conn") as HTMLElement;
      expect(el.getAttribute("data-sev")).toBe(c.sev);
      expect(el.textContent).toMatch(c.label);
      if (c.outcome !== "connected") expect(el.textContent).toMatch(/—/); // shows a recommended action
    });
  }

  it("surfaces a request error without crashing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ error: "Forbidden." }) })));
    const { container, getByRole } = render(h(ProviderConnectionTest));
    fireEvent.click(getByRole("button"));
    await waitFor(() => expect(container.querySelector(".ff-err")).toBeTruthy());
    expect(container.querySelector(".int-conn")).toBeNull();
  });
});
