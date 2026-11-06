# SAMORAH — Manufacturing Operations Handover & Launch Checklist

**Audience:** the SAMORAH operations team and the launch decision-maker.
**Status:** engineering closed and frozen. This is the operational handover — no software is created or changed here. All actions below are performed by authorised humans, in order, with the separate approvals noted. The system is **inert** today (feature switches off, no production variant tracked).

---

## 1. Engineering closure status
**Closed and frozen.** Functional architecture is complete: manufacturing, QC & design validation, material lots, a single authoritative stock ledger (`variants.stock`, written only by `apply_stock_movement`) with an append-only batch overlay, allocation, picking/packing, shipment provenance, cancellation/returns/RTO, holds & recalls with affected-customer tracing, labels, one-way activation with a DB prerequisite guard, and legacy opening-stock reconciliation where `variants.stock` stays the *sellable* balance. Further change is permitted only for a demonstrated security, accounting, data-integrity or launch-blocking defect — not new features.

## 2. Final baseline commit
**`6eec505`** on `replatform/nextjs`. Verified safety baseline (read-only): `release_enabled=false`, `allocation_enabled=false`, 10 active products, **0 real tracked variants**, 132 migrations applied (no gaps), `activate_variant_tracking` executable only by `service_role`, **no HTTP activation route**, primary dev DB not reset/restored.

## 3. Operator workflow checklist (existing Admin screens)
Screens: **`/admin/manufacturing`** (batch list), **`/admin/manufacturing/<batchId>`** (lifecycle, QC, labels), **`/admin/fulfillment`** (pick/pack/ship/provenance), **`/admin/recalls`** (recall console & affected customers), **`/admin/inventory`** (stock & allocation). Capabilities: operate=editor+, qc/qc_approve=editor/manager, release=manager, recall=admin, **activate=super_admin only**.

| # | Task | Where | Notes |
|---|------|-------|-------|
| 1 | Create a manufacturing batch | `/admin/manufacturing` → New | Needs the product's `batch_prefix`; code auto-generated (unique, collision-safe past 99) |
| 2 | Record material lots & production quantities | batch detail | Lots traced for recall; set produced / pending-inspection |
| 3 | Record QC & design validation | batch detail → QC | Required checks enforced; design validation is config-specific; SoD on approval |
| 4 | Release approved stock | batch detail → Release | Only when `qc_approved` + approved validation + `release_enabled` on + variant tracked |
| 5 | View inventory & allocation | `/admin/inventory` | On-hand = `variants.stock`; reserved via holds; batch overlay for tracked variants |
| 6 | Physical picking & packing | `/admin/fulfillment` | Confirm the ACTUAL batch; packing QC gates dispatch |
| 7 | Confirm shipped batches | `/admin/fulfillment` | Shipment batch-provenance is frozen at dispatch |
| 8 | Cancellation / returns / RTO | order & `/admin/fulfillment` | Tracked: eligible→sellable, held/recalled→quarantine; ambiguous→hold |
| 9 | Holds & recalls | `/admin/recalls` | Containment sets `recall_state`; release/label refused while recalled |
| 10 | Identify affected customers | `/admin/recalls` | PII visible only with the recall capability |
| 11 | Generate labels & review print history | batch detail → Labels | Generation ≠ physical print; "Mark printed"; retail labels blocked for non-eligible batches |
| 12 | Pause operations safely | settings (super-admin) | See §8 |
| 13 | Recover captured-but-unfinalised payments | ops | See §8 |

See `OPERATOR_VERIFICATION.md` for the detailed step-by-step and the RBAC matrix.

## 4. Actual browser-acceptance status
**PENDING — not executed.** There is no authenticated browser-automation harness, so no UI workflow may be marked passed yet. The server/DB/API layer behind every screen is machine-verified (1,654 tests). The executable acceptance checklist lives in `OPERATOR_VERIFICATION.md` (§"Phase 11B"); run it in **staging** with a **dedicated authorised test account** and **disposable records**, capturing for each workflow: action · expected · **actual observed** · pass/fail · screenshot/evidence · any confirmed blocking defect. **Do not mark an unexecuted workflow as passed.** Until signed off by a human, UI acceptance stays an open launch blocker.

## 5. Remaining business/legal decisions
From `DECISION_REGISTER.md` — none are code; the system stays inert until each is decided and separately approved:
- **Retail labels (blocks commercial print):** manufacturer/packer name & address; consumer-care contact; per-SKU MRP; Legal Metrology field set & formats (counsel); verified physical label dimensions.
- **Recall customer communications (blocks any customer contact):** approved notification policy, recipient scope, and sending process (no external send exists today).

## 6. Deployment prerequisites (technical gate)
See §9 — **Gate A**.

## 7. Per-variant inventory-activation prerequisites
Before a specific variant is made `tracked` in production (super-admin, one variant at a time):
1. **Physical count** of on-hand at a known instant.
2. **Classification:** verified **sellable** = the value `variants.stock` will hold; **quarantine** and **unknown** quantities recorded and **held aside** (never added to sellable stock).
3. **Legacy-opening sign-off** via `reconcile_variant_opening` (asserts `eligible = variants.stock`); or, for a genuinely empty variant, direct activation.
4. **Review existing reservations & open orders** on the variant.
5. **Activation eligibility green** (`variant_batch_reconciliation.activation_eligible = true`, or empty-and-consistent).
6. **Super-admin approval** (the only role that can activate; no other route can).
7. **Post-activation reconciliation** confirmed; **emergency pause procedure** (§8) understood. Activation is **one-way** — there is no deactivation; pausing is via the switches.

## 8. Emergency recovery instructions (pause + forward recovery)
No `tracked→untracked` rollback. No database restore as routine recovery.
1. **Pause new tracked checkout** — stop offering the affected tracked variants (or set `allocation_enabled=false`). A new paid order for a tracked variant then **fails closed** at finalisation (no untagged stock is consumed).
2. **Hold new releases** — set `release_enabled=false`; already-released stock is unaffected.
3. **Find captured-but-unfinalised payments** — orders left `pending` with a captured payment; list them.
4. **Preserve** — existing orders, reservations, movements and shipments are untouched by the pause.
5. **Reconcile** — `variant_batch_reconciliation`; open inventory exceptions block fulfilment until resolved.
6. **Forward recovery (idempotent)** — re-enable `allocation_enabled`, then **re-run finalisation** for each stuck order: it attributes to an eligible batch or records a durable shortfall exception — it never fabricates stock.
7. **Refund escalation** — where stock truly can't be supplied, refund, then record the conservation-guarded write-off.
8. **Resume** — re-enable checkout once reconciliation is clean.

## 9. Final GO / NO-GO — four separate gates (never one blanket approval)

**NO-GO overall until each gate below is independently approved.** Engineering is complete; the remaining gates are real-world acceptance and approvals.

### Gate A — Technical deployment
- [ ] Approved code baseline `6eec505` deployed.
- [ ] Migrations applied additively; backup/restore path confirmed on the target DB.
- [ ] Feature switches **inert** (`release_enabled=false`, `allocation_enabled=false`).
- [ ] Existing commerce regressions green (checkout, Razorpay, Shiprocket, untracked flows).
- [ ] Monitoring in place; rollback/forward-recovery (§8) understood.

### Gate B — Inventory activation (per variant, super-admin)
- [ ] Physical count done.
- [ ] Verified sellable / quarantined / unknown quantities recorded.
- [ ] Legacy-opening sign-off (`reconcile_variant_opening`).
- [ ] Existing reservations & orders reviewed.
- [ ] `activation_eligible = true`.
- [ ] Super-admin approval.
- [ ] Post-activation reconciliation confirmed; pause procedure ready.

### Gate C — Commercial labels
- [ ] Verified physical dimensions (template `dimensions_status = verified`).
- [ ] Manufacturer/packer details.
- [ ] Consumer-care contact.
- [ ] MRP + legal declarations (counsel).
- [ ] Approved final print proof.

### Gate D — Customer recall communications
- [ ] Approved notification policy.
- [ ] Approved recipient scope.
- [ ] Approved sending process.

**Also required before production (engineering-side):** the authenticated browser acceptance (§4) signed off by a human.

---

**Next actions belong to real-world acceptance and deployment approval, not feature development.** Do not push, deploy, apply production migrations, enable tracking, release live inventory, alter production stock, contact customers, or print commercial labels without separate explicit approval for the relevant gate above.
