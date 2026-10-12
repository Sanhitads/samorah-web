import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * "Receive the Letters" must actually deliver something: a NEW or reactivated subscriber gets a quiet
 * welcome email. These pin the contract — welcome on first-time only (never re-welcome an active
 * subscriber), skipped when email isn't configured, and strictly best-effort (a send failure never
 * fails the subscription). Plus the builder content.
 */
let existingRow: { is_active: boolean } | null;
let upsertError: { message: string } | null;
let emailOn: boolean;
const sendEmailMock = vi.fn(async (_m: Record<string, unknown>) => ({ sent: true }));

const reset = () => { existingRow = null; upsertError = null; emailOn = true; sendEmailMock.mockClear(); sendEmailMock.mockResolvedValue({ sent: true }); };
reset();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existingRow }) }) }),
      upsert: async () => ({ error: upsertError }),
    }),
  }),
}));
vi.mock("@/lib/email", () => ({ emailConfigured: () => emailOn, sendEmail: (m: Record<string, unknown>) => sendEmailMock(m) }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: () => ({ ok: true }), tooManyRequests: () => new Response(null, { status: 429 }) }));

import { POST } from "@/app/api/newsletter/route";
import { buildNewsletterWelcomeEmail } from "@/lib/email/newsletterWelcome";

const post = (email: unknown) =>
  POST(new Request("http://localhost/api/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, source: "homepage" }) }));

describe("POST /api/newsletter — welcome email", () => {
  beforeEach(reset);

  it("new subscriber → ok AND a welcome email to that address", async () => {
    existingRow = null;
    const res = await post("reader@example.com");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].to).toBe("reader@example.com");
    expect(String(sendEmailMock.mock.calls[0][0].subject)).toContain("Letters");
  });

  it("already-active subscriber → ok but NO re-welcome", async () => {
    existingRow = { is_active: true };
    const res = await post("reader@example.com");
    expect(res.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("reactivated (was unsubscribed) → welcome is sent again", async () => {
    existingRow = { is_active: false };
    await post("reader@example.com");
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("email not configured → ok, no send attempted", async () => {
    emailOn = false;
    const res = await post("reader@example.com");
    expect(res.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("a welcome-email failure NEVER fails the subscription", async () => {
    sendEmailMock.mockRejectedValueOnce(new Error("resend down"));
    const res = await post("reader@example.com");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("invalid email → 400, no send", async () => {
    const res = await post("not-an-email");
    expect(res.status).toBe(400);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("buildNewsletterWelcomeEmail", () => {
  it("is a quiet, branded confirmation with a text alternative", () => {
    const m = buildNewsletterWelcomeEmail();
    expect(m.subject).toContain("Letters");
    expect(m.html).toContain("You&#x27;re on the list.".replace("&#x27;", "'"));
    expect(m.html).toContain("The Letters");
    expect(m.text).toContain("unsubscribe");
  });
});
