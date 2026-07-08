import { describe, it, expect, afterEach } from "vitest";
import { emailFrom, emailReplyTo } from "@/lib/email/config";

const saved = { from: process.env.EMAIL_FROM, reply: process.env.EMAIL_REPLY_TO };
afterEach(() => {
  process.env.EMAIL_FROM = saved.from;
  process.env.EMAIL_REPLY_TO = saved.reply;
});

describe("email sender config — env-driven, no hardcoded addresses", () => {
  it("uses EMAIL_FROM / EMAIL_REPLY_TO verbatim when set", () => {
    process.env.EMAIL_FROM = "Samorah <hello@samorahstudio.com>";
    process.env.EMAIL_REPLY_TO = "hello@samorahstudio.com";
    expect(emailFrom()).toBe("Samorah <hello@samorahstudio.com>");
    expect(emailReplyTo()).toBe("hello@samorahstudio.com");
  });

  it("defaults to a hello@ brand address — never no-reply, never a .example domain", () => {
    delete process.env.EMAIL_FROM;
    delete process.env.EMAIL_REPLY_TO;
    expect(emailFrom()).toContain("hello@");
    expect(emailFrom()).not.toMatch(/no-?reply/i);
    expect(emailFrom()).not.toContain(".example");
    expect(emailReplyTo()).toContain("hello@");
    expect(emailReplyTo()).not.toContain(".example");
  });
});
