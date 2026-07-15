/**
 * Slack channel — Incoming Webhook (no bot, no maintenance). Renders an operational alert as a
 * Block Kit message with a severity colour bar, labelled fields and a "View →" button, and posts
 * it to the channel-specific webhook (falling back to the default #samorah-ops webhook). Adding a
 * per-area channel later = set its env var; no code change.
 */
import { OPS_ROUTES, SLACK_WEBHOOK_ENV, SEVERITY_COLOR, SEVERITY_EMOJI, type OpsEvent, type OpsSeverity, type SlackChannelKey } from "@/config/notifications";
import type { OpsChannel, OpsPayload, OpsDispatchResult } from "../opsTypes";

const webhookFor = (chan: SlackChannelKey): string | undefined =>
  process.env[SLACK_WEBHOOK_ENV[chan]] || process.env[SLACK_WEBHOOK_ENV.ops] || undefined;

/** Build the Block Kit payload — pure, so it's unit-testable without hitting Slack. */
export function buildSlackMessage(event: OpsEvent, payload: OpsPayload, severity: OpsSeverity): Record<string, unknown> {
  const blocks: Record<string, unknown>[] = [
    { type: "header", text: { type: "plain_text", text: `${SEVERITY_EMOJI[severity]} ${payload.title}`.slice(0, 150), emoji: true } },
  ];
  if (payload.message) blocks.push({ type: "section", text: { type: "mrkdwn", text: payload.message.slice(0, 3000) } });
  if (payload.fields?.length) {
    // Slack allows max 10 fields per section.
    blocks.push({ type: "section", fields: payload.fields.slice(0, 10).map((f) => ({ type: "mrkdwn", text: `*${f.label}*\n${f.value}` })) });
  }
  if (payload.url) blocks.push({ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "View →", emoji: true }, url: payload.url, style: severity === "critical" ? "danger" : "primary" }] });
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `\`${event}\`${payload.entityRef ? ` · ${payload.entityRef}` : ""} · ${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` }] });
  return { text: `${payload.title}${payload.entityRef ? ` (${payload.entityRef})` : ""}`, attachments: [{ color: SEVERITY_COLOR[severity], blocks }] };
}

export const slackChannel: OpsChannel = {
  key: "slack",
  configured: () => !!process.env[SLACK_WEBHOOK_ENV.ops],
  async send(event: OpsEvent, payload: OpsPayload, severity: OpsSeverity): Promise<OpsDispatchResult> {
    const chan: SlackChannelKey = payload.slackChannel ?? OPS_ROUTES[event]?.slack ?? "ops";
    const url = webhookFor(chan);
    if (!url) return { channel: "slack", status: "skipped", error: "no webhook configured" };
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildSlackMessage(event, payload, severity)) });
      const body = await res.text();
      return res.ok
        ? { channel: "slack", status: "sent", target: chan }
        : { channel: "slack", status: "failed", target: chan, error: `${res.status}: ${body.slice(0, 120)}` };
    } catch (e) {
      return { channel: "slack", status: "failed", target: chan, error: e instanceof Error ? e.message : "slack error" };
    }
  },
};
