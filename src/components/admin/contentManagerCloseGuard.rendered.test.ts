// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement as h } from "react";

/**
 * Content editor close guard — the Our Story / Behind Samorah / policy editor is a modal, and closing
 * it (backdrop click or Cancel) used to discard everything with no confirmation, so a single stray
 * backdrop click mid-edit wiped the session. These rendered proofs pin the fix: an UNCHANGED editor
 * still closes silently, but a DIRTY editor prompts, Cancel keeps the work, and Confirm discards.
 * Mirrors the BundleEditor unsaved-navigation guard philosophy. Only leaf preview deps are stubbed.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/components/legal/LegalPage", () => ({ LegalPage: () => null }));
vi.mock("@/components/faq/FaqAccordion", () => ({ FaqAccordion: () => null }));
vi.mock("@/components/contact/ContactContent", () => ({ ContactContent: () => null }));
vi.mock("@/components/product-care/ProductCareContent", () => ({ ProductCareContent: () => null }));
vi.mock("@/components/people/PeopleContent", () => ({ PeopleContent: () => null }));
vi.mock("@/components/admin/MediaPicker", () => ({ MediaPicker: () => null }));

import { render, cleanup, fireEvent, screen, act, waitFor } from "@testing-library/react";
import { ContentManager } from "@/components/admin/ContentManager";

const OUR_STORY = {
  slug: "our-story", title: "Our Story", eyebrow: "", intro: "Intro copy.",
  sections: [{ heading: "Chapter one", body: ["A line."] }], seo: {},
  status: "published", publishAt: null, unpublishAt: null, form: {},
};
const PAGES = [{ slug: "our-story", title: "Our Story", status: "published", live: true, source: "db" }];

let confirmMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  confirmMock = vi.fn(() => true);
  vi.stubGlobal("confirm", confirmMock);
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    const action = JSON.parse(String(init?.body ?? "{}")).action as string;
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
    if (action === "get") return ok({ page: OUR_STORY });
    if (action === "save") return ok({ ok: true });
    return ok({ ok: true });
  }));
});
afterEach(() => { cleanup(); document.body.innerHTML = ""; vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function openEditor() {
  render(h(ContentManager, { pages: PAGES }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Edit" })); });
  await screen.findByRole("dialog");
}
const titleInput = () => screen.getByDisplayValue("Our Story") as HTMLInputElement;
const makeDirty = () => fireEvent.change(titleInput(), { target: { value: "Our Story — edited" } });
const clickBackdrop = () => fireEvent.click(screen.getByRole("dialog"));

describe("ContentManager — close guard against losing unsaved edits", () => {
  it("unchanged editor: backdrop click closes silently (no prompt)", async () => {
    await openEditor();
    clickBackdrop();
    expect(confirmMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("dirty editor: backdrop click prompts; Cancel KEEPS the editor and the edits", async () => {
    await openEditor();
    makeDirty();
    confirmMock.mockReturnValue(false); // user clicks Cancel on the confirm
    clickBackdrop();
    expect(confirmMock).toHaveBeenCalledTimes(1);
    // Editor still open AND the edited value is preserved — nothing was discarded.
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByDisplayValue("Our Story — edited")).toBeTruthy();
  });

  it("dirty editor: backdrop click + Confirm discards and closes", async () => {
    await openEditor();
    makeDirty();
    confirmMock.mockReturnValue(true); // user confirms the discard
    clickBackdrop();
    expect(confirmMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("dirty editor: Cancel BUTTON is guarded the same way", async () => {
    await openEditor();
    makeDirty();
    confirmMock.mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeTruthy(); // kept open
  });
});
