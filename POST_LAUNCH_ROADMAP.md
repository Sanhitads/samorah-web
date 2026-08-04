# Post-Launch Roadmap

Non-blocking enhancements deliberately deferred past launch. Nothing here gates a release; each entry
records a decision made during build so it is not silently lost.

## Email

### Unify preheader / message-envelope handling across coded-default and authored emails
**Status: non-blocking · post-launch. Not required for Phase 1 closure.**

Today the transactional email "envelope" is handled in two places by design:

- **Subject** — a published CMS override applies to *both* the coded-default email and an authored
  body (via `resolveSubject` on the canonical send path).
- **Preheader (and hero/eyebrow/heading/blocks)** — apply only when an operator authors a full body
  (rendered by `renderEmailBlocks`, which emits the hidden preheader span). The **coded-default**
  builders (`emailLayout` / `build*` in `src/lib/email/`) do **not** consume a CMS preheader.

This split is intentional. Wiring a CMS preheader into the coded-default path would mean modifying the
protected transactional fallback (`compose` / `build*`) — the exact path that guarantees an invalid or
missing customization can never stop an Order Confirmation from going out. Phase 1's scope rule was to
stop and defer rather than code around that fallback.

**Future option (only if desired):** introduce a single message-envelope abstraction (subject +
preheader + from/reply-to) that both the coded-default and authored renderers consume, so a CMS
preheader could apply to the coded default too — without duplicating a renderer or weakening the
fallback guarantee. Must preserve: coded-default emails always send even with no/invalid customization;
one renderer and one token path; no second email system.

### Email Templates list — categories + search
**Status: non-blocking · post-launch. (Phase 2 point 15, intentionally deferred.)**

Seven transactional templates don't need search/filter today. When templates expand into payment,
gift-card, account, wholesale, review, loyalty, etc., group them by category and add a search box on
`/admin/emails`. Pure UI/list concern — no schema or send-path change implied.

### Delivery Log authorization — move to an operational capability
**Status: non-blocking · post-launch. Acceptable under current RBAC; refine later.**

The customer-email Delivery Log (`/admin/emails/deliveries`) is gated by `content.edit` today, reusing
the Email CMS capability. But delivery records are operational/customer data, not template *content* —
editing copy and viewing who-was-emailed-and-whether-it-failed are conceptually different rights.
Longer term, gate delivery records by an **operational** capability (e.g. `notifications.view` or
`orders.view`) rather than `content.edit`. Do **not** stand up a new RBAC architecture solely for this;
fold it in when operational-visibility capabilities are next revisited. Recipients are already masked
and provider errors redacted, so the current exposure is bounded.

### Delivery Log → failed-job deep-link (NOT built — verified limitation)
**Status: non-blocking · post-launch. Requires a schema decision; do not reconstruct heuristically.**

Phase 2 point 13 envisioned a "View failed job" link from a failed delivery to its canonical
fulfillment job. **Verified against the schema: `notification_dispatches` stores no fulfillment-job
reference** (no `fulfillment_job_id`; the row is upserted in place). The only mapping would be a
heuristic `(order_id, event) → fulfillment_jobs(order_id, job_type)` guess — and `job_type`
(`email`/`dispatch_email`/`cancellation_email`) doesn't map 1:1 to events. Per the architecture rule
we did **not** fabricate this correlation. The Delivery Log instead surfaces the failure status/error
and deep-links to the stored order/return, and documents that retry is owned by the fulfillment queue.

If a first-class link is ever wanted, the correct fix is a **stored** reference: add a nullable
`fulfillment_job_id` (or a shared correlation id) written at dispatch time on the send path. That is a
send-path + schema change — deferred, and must not weaken the transactional fallback.
