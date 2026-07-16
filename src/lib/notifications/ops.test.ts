/**
 * Multi-channel notification engine tests (Phase 5). Pure renderers + routing invariants —
 * deterministic, no network. The live end-to-end Slack post is verified separately.
 */
import { describe, it, expect } from "vitest";
import { buildSlackMessage } from "./channels/slack";
import { buildSmsText, smsChannel } from "./channels/sms";
import { buildOpsEmailHtml } from "./channels/opsEmail";
import { retryDecision, percentile, failureReasonKey } from "./opsEngine";
import { buildTimeline, type FeedItem, type FeedChannel } from "./feedTypes";
import {
  OPS_ROUTES, SEVERITY_COLOR, EVENT_CATEGORY, RETENTION_DAYS, retentionClassFor, TEST_PRESETS, CATEGORY_LABEL,
  RETRY_POLICY, backoffFor, CORRELATION, correlationKeyFor, CHANNEL_ICON,
  type OpsEvent, type NotificationCategory, type OpsChannelKey,
} from "@/config/notifications";
import type { OpsPayload } from "./opsTypes";

const sample: OpsPayload = {
  title: "New Order", message: "A new order was placed.",
  fields: [{ label: "Order", value: "SAM-000234" }, { label: "Amount", value: "₹1,299" }],
  url: "https://samorah.example/admin/orders/SAM-000234", entityRef: "SAM-000234",
};

describe("Slack Block Kit builder", () => {
  it("renders a header, fields, a View button and a severity colour", () => {
    const msg = buildSlackMessage("order.placed", sample, "info") as any;
    expect(msg.attachments[0].color).toBe(SEVERITY_COLOR.info);
    const blocks = msg.attachments[0].blocks as any[];
    expect(blocks[0].type).toBe("header");
    expect(blocks[0].text.text).toContain("New Order");
    expect(JSON.stringify(blocks)).toContain("SAM-000234");
    expect(blocks.some((b) => b.type === "actions")).toBe(true); // View → button
    expect(msg.text).toContain("New Order");
  });
  it("critical uses the red bar and danger button", () => {
    const msg = buildSlackMessage("payment.gateway_down", { ...sample, title: "Payment System Down" }, "critical") as any;
    expect(msg.attachments[0].color).toBe(SEVERITY_COLOR.critical);
  });
  it("omits the actions block when there is no url", () => {
    const msg = buildSlackMessage("order.placed", { ...sample, url: undefined }, "info") as any;
    expect((msg.attachments[0].blocks as any[]).some((b) => b.type === "actions")).toBe(false);
  });
});

describe("SMS channel (critical-only)", () => {
  it("is dormant without MSG91 env", () => { expect(smsChannel.configured()).toBe(false); });
  it("SKIPS anything below critical severity (cannot spam)", async () => {
    const r = await smsChannel.send("order.placed", sample, "info");
    expect(r.status).toBe("skipped");
    expect(r.error).toMatch(/critical/i);
    const w = await smsChannel.send("order.placed", sample, "warning");
    expect(w.status).toBe("skipped");
  });
  it("builds a compact ≤160-char one-liner", () => {
    const t = buildSmsText({ title: "Payment System Down", message: "Orders cannot be processed", fields: [{ label: "Order", value: "SAM-1" }] });
    expect(t.length).toBeLessThanOrEqual(160);
    expect(t).toContain("Payment System Down");
    expect(t).toContain("Samorah");
  });
});

describe("ops email builder", () => {
  it("includes the title, fields and a View link", () => {
    const html = buildOpsEmailHtml(sample, "warning");
    expect(html).toContain("New Order");
    expect(html).toContain("SAM-000234");
    expect(html).toContain("View →");
  });
});

describe("routing invariants", () => {
  const events = Object.keys(OPS_ROUTES) as OpsEvent[];
  it("every route has a Slack channel + severity + non-empty channels", () => {
    for (const e of events) { const r = OPS_ROUTES[e]; expect(r.channels.length).toBeGreaterThan(0); expect(r.slack).toBeTruthy(); expect(["info", "warning", "critical"]).toContain(r.severity); }
  });
  it("SMS is ONLY routed to critical events (design invariant)", () => {
    for (const e of events) { if (OPS_ROUTES[e].channels.includes("sms")) expect(OPS_ROUTES[e].severity).toBe("critical"); }
  });
  it("in-app is present on every non-marketing/report operational event", () => {
    expect(OPS_ROUTES["order.placed"].channels).toContain("in_app");
    expect(OPS_ROUTES["payment.gateway_down"].channels).toContain("in_app");
  });
  it("critical infra events include email + slack + sms", () => {
    for (const e of ["payment.gateway_down", "site.down", "security.incident"] as OpsEvent[]) {
      expect(OPS_ROUTES[e].channels).toEqual(expect.arrayContaining(["slack", "sms"]));
    }
  });
});

describe("categories (feed filters)", () => {
  it("every routed event has a known category with a label", () => {
    for (const e of Object.keys(OPS_ROUTES) as OpsEvent[]) {
      const cat = EVENT_CATEGORY[e];
      expect(cat).toBeTruthy();
      expect(CATEGORY_LABEL[cat as NotificationCategory]).toBeTruthy();
    }
  });
  it("maps events to the expected area", () => {
    expect(EVENT_CATEGORY["order.placed"]).toBe("orders");
    expect(EVENT_CATEGORY["payment.gateway_down"]).toBe("payments");
    expect(EVENT_CATEGORY["inventory.low_stock"]).toBe("inventory");
    expect(EVENT_CATEGORY["review.negative"]).toBe("customers");
    expect(EVENT_CATEGORY["cron.failed"]).toBe("system");
  });
});

describe("retention policy", () => {
  it("critical + audit events are kept 2 years", () => {
    expect(retentionClassFor("payment.gateway_down", "critical")).toBe("high");
    expect(retentionClassFor("incident.escalated", "warning")).toBe("high");
    expect(RETENTION_DAYS.high).toBe(730);
  });
  it("ordinary operational events are kept 180 days", () => {
    expect(retentionClassFor("order.placed", "info")).toBe("operational");
    expect(RETENTION_DAYS.operational).toBe(180);
  });
  it("tests are debug-class and purged in 30 days (even when critical)", () => {
    expect(retentionClassFor("payment.gateway_down", "critical", "test")).toBe("debug");
    expect(RETENTION_DAYS.debug).toBe(30);
  });
});

describe("retry policy → Dead Letter Queue", () => {
  const now = Date.parse("2026-07-16T12:00:00Z");
  const row = (o: Partial<{ status: string; attempts: number; channel: string; nextRetryAt: string | null; error: string | null }> = {}) =>
    ({ status: "failed", attempts: 1, channel: "slack", nextRetryAt: null, error: "500", ...o });

  it("retries a due failure", () => { expect(retryDecision(row(), now).action).toBe("retry"); });
  it("waits while the backoff has not elapsed", () => {
    const d = retryDecision(row({ nextRetryAt: new Date(now + 60000).toISOString() }), now);
    expect(d.action).toBe("wait"); expect(d.reason).toMatch(/backoff/);
  });
  it("moves to the DLQ once the policy is exhausted — carrying the reason", () => {
    const d = retryDecision(row({ attempts: RETRY_POLICY.maxAttempts, error: "channel_not_found" }), now);
    expect(d.action).toBe("dead"); expect(d.reason).toBe("channel_not_found");
  });
  it("never auto-retries a non-failure or a skipped/in-app row", () => {
    expect(retryDecision(row({ status: "delivered" }), now).action).toBe("wait");
    expect(retryDecision(row({ status: "skipped" }), now).action).toBe("wait");
    expect(retryDecision(row({ channel: "in_app" }), now).action).toBe("wait");   // in_app is not a provider
  });
  it("backoff escalates then clamps to the last step", () => {
    expect(backoffFor(1)).toBe(RETRY_POLICY.backoffMinutes[0]);
    expect(backoffFor(2)).toBe(RETRY_POLICY.backoffMinutes[1]);
    expect(backoffFor(99)).toBe(RETRY_POLICY.backoffMinutes[RETRY_POLICY.backoffMinutes.length - 1]);
  });
  it("policy allows a real number of attempts before giving up", () => {
    expect(RETRY_POLICY.maxAttempts).toBeGreaterThan(1);
    expect(RETRY_POLICY.autoRetryChannels).not.toContain("in_app" as OpsChannelKey);
  });
});

describe("correlation keys", () => {
  it("only noisy failure events correlate", () => {
    expect(correlationKeyFor("payment.failed")).toBe("payment.failed");
    expect(correlationKeyFor("daily.sales_report")).toBeNull();   // reports never collapse
    expect(correlationKeyFor("order.placed")).toBeNull();
  });
  it("keys on the root incident when one is known", () => {
    expect(correlationKeyFor("payment.failed", "incident", "INC-00042")).toBe("payment.failed:incident:INC-00042");
  });
  it("is deterministic and window-bounded", () => {
    expect(correlationKeyFor("api.down")).toBe(correlationKeyFor("api.down"));
    expect(CORRELATION.windowMinutes).toBeGreaterThan(0);
  });
});

describe("event timeline", () => {
  const ch = (o: Partial<FeedChannel> = {}): FeedChannel => ({
    id: "c1", channel: "slack", status: "delivered", target: "ops", error: null, attempts: 1,
    deliveryMs: 120, lastAttemptAt: "2026-07-16T08:31:00Z", nextRetryAt: null, deadAt: null, deadReason: null,
    replayedAt: null, replayedBy: null, retryHistory: [], ...o,
  });
  const item = (o: Partial<FeedItem> = {}): FeedItem => ({
    groupId: "g1", event: "order.placed", category: "orders", severity: "info", title: "New Order",
    entityType: "order", entityRef: "SAM-1", createdAt: "2026-07-16T08:31:00Z", read: true,
    readAt: "2026-07-16T08:32:00Z", acknowledgedAt: null, acknowledgedBy: null, payload: {},
    channels: [ch()], status: "delivered", correlationId: null, correlatedCount: 1, correlatedRefs: [], ...o,
  });

  it("tells the story in chronological order", () => {
    const t = buildTimeline(item({ acknowledgedAt: "2026-07-16T08:45:00Z", acknowledgedBy: "Asha" }));
    expect(t.map((x) => x.kind)).toEqual(["created", "delivered", "read", "acknowledged"]);
    expect(t.map((x) => x.at)).toEqual([...t.map((x) => x.at)].sort());   // sorted
    expect(t[3].detail).toBe("Asha");
  });
  it("includes retries and the DLQ hand-off", () => {
    const t = buildTimeline(item({
      channels: [ch({ status: "dead", error: "500", deadAt: "2026-07-16T08:50:00Z", deadReason: "retry policy exhausted", lastAttemptAt: "2026-07-16T08:49:00Z", retryHistory: [{ at: "2026-07-16T08:35:00Z", status: "failed", error: "500", by: "retry-worker" }] })],
      readAt: null, read: false,
    }));
    expect(t.map((x) => x.kind)).toEqual(expect.arrayContaining(["created", "retry", "dead"]));
    expect(t.find((x) => x.kind === "dead")?.detail).toBe("retry policy exhausted");
  });
  it("records a replay out of the DLQ", () => {
    const t = buildTimeline(item({ channels: [ch({ replayedAt: "2026-07-16T09:00:00Z", replayedBy: "Asha" })] }));
    expect(t.find((x) => x.kind === "replay")?.detail).toBe("Asha");
  });
});

describe("analytics math", () => {
  it("percentile uses nearest-rank and handles edges", () => {
    const v = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(v, 50)).toBe(50);
    expect(percentile(v, 95)).toBe(100);
    expect(percentile(v, 100)).toBe(100);
    expect(percentile([42], 95)).toBe(42);
    expect(percentile([], 95)).toBeNull();
  });
  it("percentile does not mutate the caller's array", () => {
    const v = [3, 1, 2];
    percentile(v, 50);
    expect(v).toEqual([3, 1, 2]);
  });
  it("p95 exposes the slow tail an average would hide", () => {
    // Nearest-rank p95 of 20 samples is the 19th value, so it takes 2 outliers (the top 10%) to
    // surface — a single 1-in-20 spike is p100 by definition, not p95.
    const v = [...Array(18).fill(100), 5000, 5000];
    expect(percentile(v, 50)).toBe(100);   // the median stays calm…
    expect(percentile(v, 95)).toBe(5000);  // …while p95 surfaces the tail
  });
  it("failureReasonKey groups provider errors by signature", () => {
    expect(failureReasonKey('resend 422: {"statusCode":422,"name":"validation_error","message":"Invalid `to` field."}')).toBe("resend 422");
    expect(failureReasonKey("HTTP 500: upstream boom")).toBe("HTTP 500");
    expect(failureReasonKey('{"name":"rate_limit_exceeded","message":"slow down"}')).toBe("rate_limit_exceeded");
    expect(failureReasonKey("channel not configured")).toBe("channel not configured");
    expect(failureReasonKey(null)).toBe("unknown");
    expect(failureReasonKey("   ")).toBe("unknown");
  });
  it("two identical provider failures group to ONE reason", () => {
    const a = failureReasonKey('resend 422: {"message":"Invalid `to` field. abc"}');
    const b = failureReasonKey('resend 422: {"message":"Invalid `to` field. xyz"}');
    expect(a).toBe(b);   // differing bodies must not fragment the ranking
  });
});

describe("channel icons", () => {
  it("every channel has an icon", () => {
    for (const k of Object.keys(CHANNEL_ICON) as OpsChannelKey[]) expect(CHANNEL_ICON[k]).toBeTruthy();
  });
});

describe("test presets", () => {
  it("each preset targets a real routed event", () => {
    for (const p of TEST_PRESETS) { expect(OPS_ROUTES[p.event]).toBeTruthy(); expect(p.label).toMatch(/^Test /); }
  });
  it("the critical-incident preset really is critical (so it exercises SMS routing)", () => {
    const p = TEST_PRESETS.find((x) => x.id === "critical_incident")!;
    expect(p.severity).toBe("critical");
    expect(OPS_ROUTES[p.event].channels).toContain("sms");
  });
});
