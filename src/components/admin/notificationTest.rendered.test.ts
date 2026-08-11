// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { createElement as h } from "react";
import { NotificationTestButton } from "@/components/admin/NotificationTestButton";

/** S1A Notification Test Matrix — proves Success / Partial / Failure per-channel results render correctly.
 *  Reuses the EXISTING endpoint contract (`{ results: [{channel, status, error?}] }`); fetch is mocked. */
type Result = { channel: string; status: "sent" | "failed" | "skipped"; error?: string };
const mockFetch = (results: Result[]) =>
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, results }) })));
const lis = (c: HTMLElement) => [...c.querySelectorAll(".int-test__results li")] as HTMLLIElement[];

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("NotificationTestButton — result matrix (S1A)", () => {
  it("Success — every channel sent", async () => {
    mockFetch([{ channel: "in_app", status: "sent" }, { channel: "email", status: "sent" }]);
    const { container, getByRole } = render(h(NotificationTestButton));
    fireEvent.click(getByRole("button"));
    await waitFor(() => expect(lis(container)).toHaveLength(2));
    expect(lis(container).every((li) => li.getAttribute("data-r") === "sent")).toBe(true);
    expect(lis(container)[0].textContent).toMatch(/in_app: ok/);
  });

  it("Partial Success — mix of sent + skipped", async () => {
    mockFetch([{ channel: "in_app", status: "sent" }, { channel: "sms", status: "skipped" }]);
    const { container, getByRole } = render(h(NotificationTestButton));
    fireEvent.click(getByRole("button"));
    await waitFor(() => expect(lis(container)).toHaveLength(2));
    const byChannel = Object.fromEntries(lis(container).map((li) => [li.textContent!.split(":")[0], li.getAttribute("data-r")]));
    expect(byChannel.in_app).toBe("sent");
    expect(byChannel.sms).toBe("skipped");
  });

  it("Failure — channel failed shows the error, styled failed", async () => {
    mockFetch([{ channel: "slack", status: "failed", error: "webhook 500" }]);
    const { container, getByRole } = render(h(NotificationTestButton));
    fireEvent.click(getByRole("button"));
    await waitFor(() => expect(lis(container)).toHaveLength(1));
    expect(lis(container)[0].getAttribute("data-r")).toBe("failed");
    expect(lis(container)[0].textContent).toMatch(/slack: webhook 500/);
  });
});
