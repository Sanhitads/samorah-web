// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { createElement as h } from "react";
import { FEATURE_KEYS, type SiteSettings } from "@/services/siteSettingsService";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { SiteSettingsForm } from "@/components/admin/SiteSettingsForm";

const settings: SiteSettings = {
  brand: { name: "SAMORAH", tagline: "" },
  support: { email: "hi@x.test", phone: "", hours: "", whatsapp: "", studioAddress: "" },
  social: { instagram: "", pinterest: "", spotify: "", facebook: "" },
  seo: { titleSuffix: " · S", defaultDescription: "", ogImageUrl: "" },
  analytics: { gaId: "" },
  announcement: { text: "", active: false, link: "" },
  features: Object.fromEntries(FEATURE_KEYS.map((k) => [k, false])) as SiteSettings["features"],
  maintenance: { enabled: false, message: "" },
  storeNotice: { text: "", active: false },
  costs: { packagingPerOrder: 20, paymentFeePercent: 2, shippingCostPerOrder: 60 },
  dispatch: { cutoffTime: "14:00", slaHours: 24 },
  shipping: { freeThreshold: 1499 },
};

const q = (c: HTMLElement, s: string) => c.querySelector(s) as HTMLElement | null;
const hasUnsaved = (c: HTMLElement) => [...c.querySelectorAll(".cfg-msg")].some((e) => /Unsaved changes/.test(e.textContent || ""));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("SiteSettingsForm — controlled save failure + retry (S1B)", () => {
  it("save fails gracefully (no false Saved, error shown, unsaved indicator remains), then retry succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Server exploded — try again." }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const { container, getByText } = render(h(SiteSettingsForm, { settings }));

    // Dirty the form (Brand name) so the unsaved indicator is meaningful.
    const brand = container.querySelector(".cfg-grid input") as HTMLInputElement;
    fireEvent.change(brand, { target: { value: "SAMORAH EDIT" } });
    expect(hasUnsaved(container)).toBe(true);

    // First save → controlled failure.
    fireEvent.click(getByText("Save settings"));
    await waitFor(() => expect(q(container, ".cfg-msg--err")).toBeTruthy());
    expect(q(container, ".cfg-msg--err")!.textContent).toMatch(/Server exploded/);
    expect(q(container, ".cfg-msg--ok")).toBeNull();      // NO false "Saved"
    expect(hasUnsaved(container)).toBe(true);              // unsaved indicator remains (baseline unchanged)

    // Retry → succeeds; "Saved." shown and the form is clean (indicator gone).
    fireEvent.click(getByText("Save settings"));
    await waitFor(() => expect(q(container, ".cfg-msg--ok")).toBeTruthy());
    expect(q(container, ".cfg-msg--ok")!.textContent).toMatch(/Saved/);
    expect(hasUnsaved(container)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
