# SAMORAH — Proposed Customer Communication Policy for Product Recalls (DRAFT for review)

**Status:** proposal, not in force. **External dispatch is disabled in code.** This document is for review and sign-off by SAMORAH leadership (and, where relevant, legal/regulatory counsel) before any customer is contacted. The recall console only *prepares and records* a reviewable contact list; it sends nothing.

## 1. Scope & principles
- Applies to formal recalls (`kind='recall'`) and, where leadership decides, precautionary manufacturing holds that reached customers.
- **Actual evidence over inference.** Contact is driven by confirmed shipment provenance (`shipment_batch_lines`), never by logical allocation alone. Logical-allocation-only orders are listed for *review*, not auto-contacted.
- **No fabricated evidence.** Where physical provenance is unknown, the case is flagged for manual investigation, not assumed.
- **Least data.** Customer contact details are accessible only to the `manufacturing.recall` role and are never exposed by generic manufacturing endpoints. Access is auditable.

## 2. Who gets contacted (necessity tiers)
- **Required:** orders with *confirmed shipped* provenance from an affected batch (delivered, in transit, or dispatched). Auto-marked `necessity='required'`, pending approval.
- **Review:** orders with picked-but-not-shipped or logical-allocation-only links. A human decides necessity (often *not required* if the unit never left, e.g., contained before dispatch).
- **Not required:** orders whose affected units were contained before dispatch, cancelled, or fully refunded.

## 3. Approval gate
No message is queued until: (a) the recall case is at least `contained`; (b) the contact list is `approved` by an authorised approver; and (c) a severity-appropriate message template is approved. Each contact row carries `approval_status` (`pending`/`approved`/`rejected`).

## 4. Message content (to be drafted per severity)
Severity `critical`/`high`: clear hazard statement, affected product/batch, stop-use instruction, remedy (refund/replacement), and a contact channel. `medium`/`low`: informational/precautionary. Final wording requires leadership (and legal where applicable) sign-off; do not auto-generate hazard language.

## 5. Channels, throttling, idempotency
- Preferred channel: email (the system of record for order contact). SMS only if leadership approves and numbers are verified.
- **Exactly-once:** one notification row per `(recall, order)`; dispatch (when later enabled) must be idempotent and never duplicate for the same case/order. Attempts and outcomes are recorded; failures flag `needs_followup`.
- Rate/throttle limits to be set with the email provider before enabling dispatch.

## 6. Records & audit
- Full per-contact history (necessity, approval, attempts, outcome, follow-up) is retained on `recall_notifications`.
- Customer-data access for recall investigation is audited (`audit_logs`).
- Retain recall communication records per the applicable retention schedule (to be confirmed).

## 7. What is explicitly NOT automated (requires separate approval)
- Any real email/SMS send (provider integration is intentionally **not** wired).
- Any automatic contact triggered by case creation or containment.
- Any inference of delivery/shipment that isn't backed by a real shipment/order record.

## 8. Open questions for sign-off
- Legal/regulatory notification obligations and timelines for candle products in the operating markets.
- Remedy policy (refund vs replacement vs store credit) per severity.
- Whether precautionary holds ever warrant proactive customer contact.
- Data-retention period for recall communications.
