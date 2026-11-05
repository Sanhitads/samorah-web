# SAMORAH — Manufacturing Tracking Activation Readiness (read-only go-live checklist)

**Status:** reference checklist produced during Phase 11A. **It activates nothing.** The whole manufacturing batch-tracking system is built **inert**: two global switches (`release_enabled`, `allocation_enabled`) default **false**, every production variant is `untracked`, and `apply_stock_movement` (the single writer of `variants.stock`) is unchanged. Nothing below is a step Claude performs — it is the set of preconditions a human must satisfy, and the explicit approvals required, before any variant is made `tracked` in production.

This document is intentionally **not** an activation runbook. Activation is a separate, explicitly approval-gated phase (see the standing restrictions in [`DECISION_REGISTER.md`](./DECISION_REGISTER.md)). Treat the boxes here as "must all be true", not "do these now".

---

## A. System-wide prerequisites (must hold before ANY variant is tracked)

- [ ] **Clean migration chain** — the full migration chain replays cleanly into a fresh database (verified in Phase 11A against a disposable DB: all migrations applied from empty; 21 manufacturing tables present; switches default false/false). Re-confirm on the target before go-live.
- [ ] **Switches confirmed false in production** — `manufacturing_settings.release_enabled = false` and `allocation_enabled = false` in the production DB until the moment of a deliberate, approved activation.
- [ ] **No production variant is `tracked`** — `select count(*) from variants where tracking_state = 'tracked'` returns 0 in production (the only tracked rows anywhere today are disposable test fixtures on local dev, `is_active = false`).
- [ ] **RLS & grants audited** — append-only ledgers (`inventory_movements`, `batch_stock_entries`, `variant_tracking_epochs`) grant `UPDATE`/`DELETE` to the table **owner only** (`postgres`); anon/authenticated/service_role have INSERT/SELECT as designed, never UPDATE/DELETE. (Verified in Phase 11A.)
- [ ] **Ledger integrity audit clean** — independent audit returns 0 arithmetic violations, 0 negative stock, 0 overlay-without-movement (non-legacy), 0 overlay/batch variant mismatches. Re-run on production data before activation.
- [ ] **RBAC capabilities mapped to real staff** — `manufacturing.operate` (editor+), `qc`/`qc_approve`, `release` (manager), `recall` (admin), `activate` (**super_admin only**) are assigned to the correct people; no shared accounts for `release`/`recall`/`activate`.
- [ ] **Backups & rollback** — a point-in-time restore path is confirmed for production, and the activation is reversible by a documented procedure (deactivating a variant is a decision in the register, not yet an automated path).

## B. Per-variant prerequisites (must hold for EACH variant before it becomes `tracked`)

A variant may only move `untracked → tracked` when **all** of the following are true. These mirror the DB guards (`variant_tracking_epochs`, `tg_tracked_attribution_complete`, `tg_movement_no_backdate`, reconciliation v5), so the system fails closed if any is skipped.

- [ ] **Physical stock count** — a real, counted on-hand quantity exists for the variant as of a known instant (the activation epoch). This is a human floor count, not a system number.
- [ ] **Opening attribution decided** — the opening on-hand is attributed either to real batches or to an explicit **legacy/synthetic opening** disposition (see register item *Legacy classification*). The reconciliation view must report `activation_eligible = true` for the variant.
- [ ] **Reconciliation green** — `variant_batch_reconciliation` shows `fully_reconciled = true` (overlay_ledger_drift = 0, physical_consistent, accounting_explained) for the variant at the epoch.
- [ ] **At least one releasable batch path** (if the variant will sell from tracked stock) — a batch exists or can be created, QC-approvable, with an `earliest_release_date` set; `release_enabled` will gate the actual release.
- [ ] **Label readiness (if retail labels will be printed)** — template `dimensions_status = verified` for the variant's format, and the missing business/legal fields in [`../retail-label-field-completeness.md`](../retail-label-field-completeness.md) are resolved. Not required to track; required to print retail.
- [ ] **No open recall/hold** affecting the variant's batches.
- [ ] **Epoch immutability understood** — once the activation epoch is written it is immutable and no-backdating is enforced; movements before the epoch are rejected. Confirm the counted instant is correct before writing it.

## C. Explicit approvals required (each is a separate human sign-off)

1. **Enable `release_enabled`** — manager+ decision; turns on batch release. Reversible.
2. **Enable `allocation_enabled`** — manager+ decision; turns on batch allocation to orders. Reversible.
3. **Set a specific production variant `tracked`** — **super_admin only**, per variant, with the Section-B checklist complete and the physical count attached. Writes an immutable epoch.
4. **First real retail print run** — only after the label field-completeness + dimensions checklist are signed off.

> None of 1–4 is performed by Claude. Each requires the user's explicit, separate approval, per the standing phase restrictions.

## D. What is explicitly OUT of scope until a later approved phase
- Enabling live inventory tracking on real catalogue variants.
- Moving real inventory, or any production change to `apply_stock_movement`.
- Contacting real customers for any recall/notification (the notification tables never send externally).
- Real/commercial label printing.
- Any Vercel deploy, git push, or production DB change beyond authorised additive migrations.

## E. Current status snapshot (Phase 11A, local dev only)
- Switches: `release_enabled = false`, `allocation_enabled = false`.
- Production catalogue (10 real products): **all untracked**.
- Tracked variants anywhere: only disposable test fixtures (`is_active = false`), cleaned after each verification run.
- Migration chain: replays cleanly from empty (disposable-DB verified).
- Ledger audit: clean (see Section A).
- **Recommendation:** the system is safe to leave inert. Do **not** begin activation rehearsal without the Section-A/B/C gates and a separate explicit approval.
