import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Contact enquiries notify the business by email so a message is never missed. These pin the
 * additive behaviour: a new enquiry is STORED authoritatively AND emails the support inbox with
 * Reply-To = the customer — but the email is strictly best-effort and must NEVER fail the save,
 * must be skipped when email isn't configured, and must address the same support inbox the
 * /contact page shows (Site Settings → support.email, falling back to the commerce default).
 */
let insertResult: { id: string; number: string } | null;
let insertError: { message: string } | null;
let emailOn: boolean;
let sendResult: { sent: boolean; reason?: string };
let supportEmail: string;
const sendEmailMock = vi.fn(async (_msg: Record<string, unknown>) => sendResult);

const reset = () => {
  insertResult = { id: "enq-1", number: "ENQ-0001" };
  insertError = null;
  emailOn = true;
  sendResult = { sent: true };
  supportEmail = "hello@samorahstudio.com";
  sendEmailMock.mockClear();
};
reset();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      // First insert → .select().single() (enquiry row); events insert → .then() (fire-and-forget).
      insert: () => ({
        select: () => ({ single: async () => ({ data: insertResult, error: insertError }) }),
        then: (onOk: (v: unknown) => void) => onOk({ error: null }),
      }),
    }),
  }),
}));
vi.mock("@/services/auditService", () => ({ logEvent: vi.fn(async () => {}) }));
vi.mock("@/services/notificationCenterService", () => ({ emitNotification: vi.fn(async () => {}) }));
vi.mock("@/services/siteSettingsService", () => ({ getSiteSettings: async () => ({ support: { email: supportEmail } }) }));
vi.mock("@/config/site", () => ({ canonicalOrigin: () => "https://samorahstudio.com" }));
vi.mock("@/lib/email", () => ({ emailConfigured: () => emailOn, sendEmail: (msg: Record<string, unknown>) => sendEmailMock(msg) }));

import { createEnquiry, buildEnquiryEmail } from "@/services/enquiryService";
import { COMMERCE } from "@/config/commerce";

const input = {
  firstName: "Asha", lastName: "Rao", email: "asha@example.com", phone: "+91 90000 11111",
  subject: "Order help", orderNumber: "SAM-12", message: "Where is my order?\nThanks", consent: true,
};

describe("createEnquiry — business email notification (additive, best-effort)", () => {
  beforeEach(reset);

  it("stores the enquiry AND emails the support inbox with Reply-To = customer", async () => {
    const res = await createEnquiry(input);
    expect(res.ok).toBe(true);
    expect(res.number).toBe("ENQ-0001");
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const msg = sendEmailMock.mock.calls[0][0];
    expect(msg.to).toBe("hello@samorahstudio.com");       // the contact-page support inbox
    expect(msg.replyTo).toBe("asha@example.com");          // staff reply goes straight to the customer
    expect(String(msg.subject)).toContain("Order help");
    expect(String(msg.subject)).toContain("ENQ-0001");
    expect(String(msg.html)).toContain("/admin/enquiries/enq-1"); // admin deep-link
  });

  it("NEVER fails the save when the email send fails", async () => {
    sendResult = { sent: false, reason: "resend 500" };
    const res = await createEnquiry(input);
    expect(res.ok).toBe(true);           // stored result is authoritative
    expect(res.number).toBe("ENQ-0001");
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("skips email entirely when the provider isn't configured", async () => {
    emailOn = false;
    const res = await createEnquiry(input);
    expect(res.ok).toBe(true);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("falls back to the commerce support email when Site Settings has none", async () => {
    supportEmail = "";
    await createEnquiry(input);
    expect(sendEmailMock.mock.calls[0][0].to).toBe(COMMERCE.support.email);
  });

  it("does not attempt email when the insert itself fails", async () => {
    insertResult = null;
    insertError = { message: "db down" };
    const res = await createEnquiry(input);
    expect(res.ok).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("buildEnquiryEmail — deterministic content", () => {
  it("includes the number, fields, message, admin link, and the reply hint; escapes HTML", () => {
    const m = buildEnquiryEmail({ ...input, message: "<script>hi</script> & more" }, "ENQ-9", "https://samorahstudio.com/admin/enquiries/x");
    expect(m.subject).toBe("New contact enquiry · Order help (#ENQ-9)");
    expect(m.html).toContain("Asha Rao");
    expect(m.html).toContain("asha@example.com");
    expect(m.html).toContain("Reply to this email to respond to Asha Rao");
    expect(m.html).toContain("&lt;script&gt;"); // message is HTML-escaped, not injected
    expect(m.html).not.toContain("<script>hi");
    expect(m.text).toContain("Message:");
  });
});
