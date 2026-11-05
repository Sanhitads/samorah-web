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

## Notes
- No entry here authorises Claude to act. These are human decisions; the system stays inert until each dependent capability is explicitly activated per [`ACTIVATION_READINESS.md`](./ACTIVATION_READINESS.md).
- Items 2–5 are also tracked in [`../retail-label-field-completeness.md`](../retail-label-field-completeness.md); this register is the single index of *all* open decisions across modules.
