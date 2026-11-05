# SAMORAH — Manufacturing Tracking Decision Register

**Status:** open decisions that must be made by SAMORAH (business/legal/operational) before specific capabilities go live. Each entry says whether it **blocks activation** or is **optional/deferred**, who owns it, and what the system does in the meantime. The system never fabricates any of these values; where a decision is unmade, the relevant feature is gated or the field is enumerated as "missing" so no one ships an incomplete artefact unknowingly.

Legend — **Blocking**: must be decided before the dependent capability is activated in production. **Optional**: can be deferred without blocking core tracking.

| # | Decision | Blocks what | Blocking? | Owner | System behaviour until decided |
|---|----------|-------------|-----------|-------|--------------------------------|
| 1 | **Label physical dimensions** per format (190 g glass / 150 g ceramic / 100 g candle / 100 ml freshener) | First **retail/product** print run | Blocking (for retail print only) | Ops + packaging | Templates carry `dimensions_status = unverified`; UI warns; generation allowed as proof, real run gated by sign-off (see label doc §7). |
| 2 | **Manufacturer / packer name & full address** | Retail label completeness | Blocking (retail print) | Business/Legal | `batch_label_payload` lists `manufacturer_name_and_address` under `missing_business`; never invented. |
| 3 | **Consumer-care contact** (name, phone/email, address) | Retail label completeness | Blocking (retail print) | Business | Enumerated in `missing_business`; not printed. |
| 4 | **MRP (inclusive of taxes) per SKU** | Retail label completeness | Blocking (retail print) | Business/Finance | System stores selling `price`, not a declared MRP; MRP enumerated as missing. |
| 5 | **Legal/compliance field set & formats** (country of origin, Legal Metrology net-quantity format, DoM format, licences, ingredient/warning declarations) | Retail label legality | Blocking (retail print) | Legal counsel | Enumerated in `missing_legal`; **confirm with counsel** — not legal advice. |
| 6 | **Recall customer-communication policy** (channels, templates, who approves a send, external send system) | Any real recall customer contact | Blocking (real recall comms) | Business/Legal + Ops | Recall notification tables record intent only; **no external send exists**. See [`../recall-customer-communication-policy.md`](../recall-customer-communication-policy.md). |
| 7 | **Physical stock verification procedure** (how on-hand is counted at the activation epoch; who signs it) | Per-variant activation | Blocking (activation) | Ops | Reconciliation requires `activation_eligible`; no automated count — a human floor count is required. |
| 8 | **Legacy / opening-stock classification** (how pre-tracking on-hand is attributed: real batches vs explicit synthetic opening disposition) | Per-variant activation | Blocking (activation) | Ops + Finance | Reconciliation surfaces `has_synthetic_disposition`; opening must be explicitly dispositioned, never silently assumed. |
| 9 | **Partial-refund / write-off handling policy** for inventory exceptions (captured-unallocated → refund vs reallocate vs write-off) | Clean exception resolution in production | Optional (core works; policy improves consistency) | Ops + Finance | Exception lifecycle exists (`pending_reallocation`/`refund_initiated`/`resolved_*`); default is operator-driven per case. |
| 10 | **Reservation strategy at allocation** (how stock reservations map to batches when `allocation_enabled`) | Turning on `allocation_enabled` | Optional (FIFO default exists) | Ops | FIFO allocation to eldest releasable batch is the implemented default; revisit only if a different policy is wanted. |
| 11 | **Scanner / printer hardware** (barcode symbology, scanner model, label printer + stock) | Real print + scan-verify workflow | Optional (generation is hardware-agnostic) | Ops/IT | Encoded value = immutable `batch_code`; preview flags any code≠batch_code mismatch; actual scan verify is a physical step. |
| 12 | **Variant deactivation path** (how a `tracked` variant is safely turned off) | Reversing an activation | Optional (activation is itself gated/reversible by restore) | Super_admin + Eng | Not yet an automated path; documented as a register item so it is decided before, not after, first activation. |

## Blocking summary
- **Before retail label print:** items 1–5.
- **Before real recall customer contact:** item 6.
- **Before per-variant activation:** items 7, 8.
- **Before `allocation_enabled`:** item 10 is a conscious default (FIFO) — confirm it is acceptable.
- **Optional / deferrable:** items 9, 11, 12.

## Phase 11B assessment (per decision)

For each open decision: **Owner**, **Evidence required** to close it, **Proposed recommendation** (not a decision — nothing is fabricated), **Blocks activation?**, **Blocks commercial retail printing?**, **Pilot-safe to exclude?** (can a tightly-scoped internal pilot proceed without it), **Status**.

1. **Label dimensions** — Owner: Ops+packaging. Evidence: physical 1:1 print + measure + scan sign-off per format (label doc §7). Recommendation: verify per format on production stock/printer before any run. Blocks activation? No. Blocks retail printing? **Yes.** Pilot-safe to exclude? Yes (internal/no-print pilot). Status: open.
2. **Manufacturer / packer name & address** — Owner: Business/Legal. Evidence: registered entity details. Recommendation: supply from company records. Blocks activation? No. Blocks retail printing? **Yes.** Pilot-safe? Yes (no printing). Status: open — not invented.
3. **Consumer-care contact** — Owner: Business. Evidence: monitored phone/email/address. Recommendation: use the support channel. Blocks activation? No. Blocks retail printing? **Yes.** Pilot-safe? Yes. Status: open.
4. **MRP per SKU (incl. taxes)** — Owner: Business/Finance. Evidence: approved price list with tax treatment. Recommendation: derive MRP from the pricing policy (system stores selling `price`, not a declared MRP). Blocks activation? No. Blocks retail printing? **Yes.** Pilot-safe? Yes. Status: open.
5. **Legal/compliance fields & formats** (country of origin, Legal Metrology net-quantity format, DoM format, licences, ingredient/warning) — Owner: Legal counsel. Evidence: counsel's written determination per product classification. Recommendation: obtain counsel sign-off; do not assume. Blocks activation? No. Blocks retail printing? **Yes.** Pilot-safe? Yes. Status: open — **not legal advice**.
6. **Recall customer-communication policy & external send** — Owner: Business/Legal+Ops. Evidence: approved channels, templates, approver, and a chosen send system. Recommendation: keep send disabled until approved; notifications record intent only. Blocks activation? No (recall containment works internally). Blocks retail printing? No. Pilot-safe? Yes (pilot avoids real recall comms). Status: open.
7. **Physical stock-verification procedure** — Owner: Ops. Evidence: a signed counting SOP + a completed count at the epoch. Recommendation: human floor count tied to the activation instant. Blocks activation? **Yes.** Blocks retail printing? No. Pilot-safe? **No** (a pilot still needs a real opening count). Status: open.
8. **Legacy / opening-stock classification** — Owner: Ops+Finance. Evidence: per-variant classification into eligible / quarantine / unknown + a `variant_legacy_reconciliation` sign-off. Recommendation: typed legacy container, explicit disposition, no invented batches. Blocks activation? **Yes.** Blocks retail printing? No. Pilot-safe? **No.** Status: open — opening *overlay* accounting is Phase-12 build.
9. **Partial-refund / write-off policy** — Owner: Ops+Finance. Evidence: a policy for captured_unallocated → refund/reallocate/write-off. Recommendation: refund-first, then conservation-guarded write-off (already how `dispose_exception_shortfall` works). Blocks activation? No. Blocks retail printing? No. Pilot-safe? Yes (operator-driven default exists). Status: open (policy nicety).
10. **Reservation strategy at allocation** — Owner: Ops. Evidence: confirmation that FIFO-to-eldest-eligible-batch is acceptable. Recommendation: accept the implemented FIFO default. Blocks activation? No (default exists). Blocks retail printing? No. Pilot-safe? Yes. Status: confirm FIFO.
11. **Scanner / printer hardware** — Owner: Ops/IT. Evidence: chosen symbology + scanner/printer models + a scan-verify test. Recommendation: verify decoded value equals `batch_code`. Blocks activation? No. Blocks retail printing? No (generation is hardware-agnostic) — but blocks the *scan-verify* workflow. Pilot-safe? Yes. Status: open.
12. **Controlled variant-deactivation path** — Owner: Super_admin+Eng. Evidence: a design that reconciles and quarantines tracked stock before any `tracked→untracked`. Recommendation: **build a guarded, reconciled, operator-only deactivation RPC; never automate the raw flip** (Phase 11B proved the raw flip breaks `physical_consistent`). Blocks activation? No. Blocks retail printing? No. Pilot-safe? Yes (pilot simply never deactivates). Status: open — Phase-12 hardening.

**Summary:** only **#7 and #8** block activation and cannot be excluded even by a pilot. **#1–#5** block commercial retail printing only. Everything else is deferrable for a tightly-scoped internal pilot.

## Notes
- No entry here authorises Claude to act. These are human decisions; the system stays inert until each dependent capability is explicitly activated per [`ACTIVATION_READINESS.md`](./ACTIVATION_READINESS.md).
- Items 2–5 are also tracked in [`../retail-label-field-completeness.md`](../retail-label-field-completeness.md); this register is the single index of *all* open decisions across modules.
- Phase 11B added item 12 (controlled deactivation) and the per-decision assessment above. The audit + rehearsal evidence is in [`PHASE_11B_ACTIVATION_REHEARSAL.md`](./PHASE_11B_ACTIVATION_REHEARSAL.md).
