# SAMORAH — Phase 11B: Activation Rehearsal, Audit & Recovery Design

**Scope:** isolated local/staging rehearsal + source audit. **Activates nothing.** No push, no deploy, no production DB change, no real customer contact, no commercial printing. The primary local dev DB was left unchanged; structural work ran in a throwaway database (`mfg_rehearsal`) built by a clean full-chain replay, and the behavioural rehearsal ran through the real services with disposable `is_active=false` fixtures that are reset afterwards.

Evidence files (session scratchpad): `fn_defs.sql` (authoritative function bodies), `triggers.txt` (trigger/grant dump), `rehearsal_dbboundary.sql` (isolated-DB accounting demo). Tests: `phase11bRehearsal.integration.test.ts`, `phase11aE2E.integration.test.ts`, plus the phase-7A/8/9/10 suites.

---

## Part A.1 — Label print audit integrity

Source: `generate_label` / `confirm_label_printed` (migrations `20261104310000_manufacturing_phase10_labels.sql:77`, `20261104320000_manufacturing_phase11a_label_print_status.sql:15`); grants in `triggers.txt`.

| Requirement | Finding | Evidence |
|---|---|---|
| Immutable generation evidence cannot be rewritten | **Holds.** `label_print_jobs` grants `service_role` **INSERT + SELECT only** (no UPDATE/DELETE); anon/authenticated have no row writes. The evidence columns (`batch_code`, `data_snapshot`, `template_key/version`, `quantity`, `printed_by`) can never be altered through the API. | grant dump |
| Controlled status changes are audited | **Holds.** The only mutator is `confirm_label_printed` (SECURITY DEFINER, runs as owner), which sets **only** `status='printed'`, `printed_confirmed_by`, `printed_confirmed_at` — never the evidence. `labelService.confirmLabelPrinted` also writes a `label.print_confirmed` audit event. | fn body; `labelService.ts` |
| Duplicate print-confirmation is idempotent | **Holds.** `if j.status='printed' then return already_printed`. Re-confirm is a no-op. | fn body line 706; test `phase10Labels` #3 |
| Generated jobs ≠ physical printing | **Holds.** A job is born `status='generated'`; physical print is a separate confirmed transition. | migration 320000; test #3 |
| Reprints preserve batch identity + history | **Holds.** `generate_label` re-reads the batch's immutable `batch_code` every time; the encoded value equals it; each print appends a new row (append-only). | fn body; `phase10Labels` #2,#10 |
| Retail eligibility re-checked at generation and reprint | **Holds.** For `purpose in ('retail','product_batch_id')`, every call re-checks `recall_state='none'`, `lifecycle_status='qc_approved'`, and a current approved design validation — there is no cached "eligible" flag. | fn body lines 673-679 |
| Missing legal fields / unverified dimensions cannot yield a production-approved retail print | **Holds (two layers).** `batch_label_payload` enumerates `missing_legal`/`missing_business` and never fabricates them; template `dimensions_status` stays `unverified` until a physical sign-off (label doc §7). Generation is allowed as a proof; committing to a production run is gated operationally. | label doc §5–§7 |

**Append-only evidence vs mutable operational status — the precise distinction:** the *generation record* (what was encoded, from which template version, for which batch, by whom) is **append-only and immutable** — enforced by the absence of any UPDATE/DELETE grant to non-owner roles, so no API caller can rewrite or delete it. The *print lifecycle status* (`generated → printed`, or `void`) is a small, **controlled, audited mutable field**, changed only by one SECURITY-DEFINER RPC that touches nothing else and records who/when. Evidence is a fact about the past (never changes); status is a claim about a physical action (changes once, audited).

## Part A.2 — Inventory accounting boundary (actual SQL reviewed)

Authoritative bodies dumped from the fully-migrated DB (`fn_defs.sql`); migration of last definition cited.

| Function | Migration (latest) | Security | Key boundary guarantees |
|---|---|---|---|
| `apply_stock_movement` | `20260816120000_inventory_ledger.sql:75` (**never redefined**) | DEFINER, `search_path=public`, service_role-only | **Sole writer of `variants.stock`.** Locks the variant `FOR UPDATE`; idempotency gate; **non-negative guard** (`check_violation`); writes the append-only `inventory_movements` row in the same txn. |
| `release_batch` | `20261104300000_...phase9_accounting_fix.sql` | DEFINER, `search_path=''` | Fail-closed on `release_enabled`; requires `tracked` + `qc_approved` + `recall_state='none'` + current approved design validation; over-release guard; canonical lock order (variant→batch); posts movement + movement-backed overlay and reconciles overlay==qty. |
| `finalize_order` | `20261104190000_...sale_allocation_inert.sql:169` | DEFINER, `search_path=public` | Locks order; idempotent (payment key / terminal state); amount-paise verification; posts one `sale` movement per reserved variant (full aggregate deduction); calls `allocate_order_batches` (posts **no** new aggregate movement → no double deduction); deletes reservations. |
| `allocate_order_batches` | `20261104200000_...7b1_hardening.sql:60` | DEFINER, `search_path=''` | No-op if `allocation_enabled=false`; **skips untracked variants**; FIFO over eligible batches (`recall_state='none'`, released lifecycle, approved validation), `FOR UPDATE`; movement-backed negative overlay keyed to the sale movement; shortfall → **durable** `order_inventory_exceptions` (nothing invented). |
| `variant_batch_reconciliation` | `20261104240000_...writeoff_provenance.sql:29` (v5) | `sql STABLE` (read-only) | Computes drift, `physical_consistent`, `accounting_explained`, `has_synthetic_disposition`, `fully_reconciled`, and `activation_eligible` (= fully reconciled **and** human legacy sign-off). Cannot mutate. |
| `activate_variant_tracking` | `20261104210000_...7b2_accounting.sql:186` | DEFINER, `search_path=''` | Locks variant `FOR UPDATE`; sets `tracking_state`; stamps the **immutable** `variant_tracking_epochs` row on `tracked`. **Does NOT check `activation_eligible`, and permits `tracked→untracked`** (see Part F finding). |
| `cancel_order` | `20261104200000_...7b1_hardening.sql:136` | DEFINER, `search_path=public` | Tracked: eligible original batches → sellable (movement+overlay), held/recalled → `batch_quarantine` (never auto-sellable); untracked path unchanged; idempotent on already-cancelled. |
| `commit_receipt` | `20261104220000_...returns_rto_refund.sql:201` | DEFINER, `search_path=public` | Over-receipt guard; tracked → `attribute_receipt_restock` (ambiguous/unknown → hold/quarantine), untracked → plain restock; receipt-level atomicity; idempotent on committed. |
| `adjust_batch_inventory` | `20261104210000_...7b2_accounting.sql:104` | DEFINER, `search_path=''` | Tracked-only; posts movement + matching overlay; idempotency key; refuses if batch≠variant. |
| `reallocate_order_exception` | `20261104210000_...7b2_accounting.sql:135` | DEFINER, `search_path=''` | FIFO fill of an open shortfall from now-eligible batches; resolves `resolved_allocated` or stays `pending_reallocation`. |
| `dispose_exception_shortfall` | `20261104260000_...phase8_closure.sql:331` | DEFINER, `search_path=''` | Requires `resolved_refunded` first (financial evidence); conservation guard (`batch_onhand ≥ shortfall`); movement-less write-off overlay (aggregate untouched); marks `resolved_written_off` (synthetic, not verified provenance). |

**The fail-closed boundary — `tg_tracked_attribution_complete`** (DEFERRABLE INITIALLY DEFERRED constraint trigger on `inventory_movements`, `triggers.txt`). For a tracked variant, every post-epoch non-`opening_balance` movement must, at transaction commit, have its batch overlay equal its delta — a `sale` may be short **only** by the open exception(s) attributed to that movement. Otherwise the whole transaction rolls back. This is what makes "no untagged consumption of tracked stock" a hard DB guarantee rather than an application convention. Companion `tg_movement_no_backdate` pins a tracked movement's `created_at` to `now()` so it can never be filed before the epoch.

Independent audit over the primary dev DB (recomputed from raw tables, not via the reconciliation RPC): **0 arithmetic violations, 0 negative stock, 0 overlay-without-movement (non-legacy), 0 overlay/batch variant mismatches.** The only UPDATE/DELETE grants to non-owner roles are `batch_allocations` (a legitimate mutable state machine) and `inventory_receipt_items` (immutable **after commit** via a trigger). All true ledgers (`inventory_movements`, `batch_stock_entries`, `variant_tracking_epochs`, `batch_release_events`, `shipment_batch_lines`, `batch_pick_confirmations`, `label_print_jobs`) have no non-owner UPDATE/DELETE.

## Part A.3 — Recovery strategy (NOT "restore a backup")

Restoring a database backup is **not** the normal way to reverse activation once real transactions exist: a restore discards every payment, order, movement and shipment created after the backup, and cannot recreate real manufacturing provenance. It is an absolute-last-resort disaster-recovery action, appropriate only for catastrophic corruption with no forward path, and always loses post-backup transactions.

The correct recovery model uses **pause + fail-closed + forward recovery**, all demonstrated in `phase11bRehearsal.integration.test.ts`:

1. **Safe pause of new releases** — `release_enabled=false`. Blocks new `release_batch` calls only; already-released stock and all existing orders are untouched. Fully reversible, no data effect.
2. **Fail-closed on allocation** — `allocation_enabled=false` while a variant is still `tracked` makes a paid order for that variant **fail to finalize** (the deferred attribution trigger rolls the transaction back: no overlay, no exception → no untagged consumption). *Proven:* the paid order stays `pending`, no movement is posted, the reservation is intact, and released stock is unchanged. **Operational consequence to understand:** the payment may already be captured externally, so this creates a "payment captured / order pending" item to recover — it does **not** silently consume stock. Therefore the *graceful* pause order is: stop new tracked-variant checkouts at the storefront first, then flip the switch; flipping the switch alone is a hard fail-closed, not a graceful drain.
3. **Preservation of committed payments/orders/shipments** — a rolled-back `finalize_order` leaves the order exactly as it was (pending, reservation intact, no invoice). Nothing committed is lost.
4. **Forward recovery (idempotent reprocessing, no fabrication)** — re-enable allocation and **re-run the same `finalize_order`**: it either attributes to a now-eligible batch (fully reconciled) or records a **durable shortfall exception** — never invents stock. *Proven* both ways. `finalize_order`, `release_batch`, `apply_stock_movement`, `commit_receipt`, `cancel_order` are all idempotent on their keys, so reprocessing is safe.
5. **Reconciliation after an interruption** — `variant_batch_reconciliation` is the independent read; any open exception keeps `fully_reconciled=false` and blocks fulfilment until resolved. A DB transaction that is interrupted mid-way rolls back atomically (SECURITY-DEFINER functions are single transactions), leaving no partial state.
6. **Compensating entries where justified** — `dispose_exception_shortfall` (after a real refund) is the only sanctioned write-off, movement-less and conservation-guarded; `reallocate_order_exception` is the forward fix when stock becomes available. Both are append-only overlay entries, never edits.
7. **Monitoring & escalation** — open `order_inventory_exceptions`, `batch_receipt_holds`, `batch_quarantine`, and any `physical_consistent=false`/`fully_reconciled=false` reconciliation are the signals; each has an owner path (ops resolves exceptions; a manager authorises reallocation; recall is admin-gated). (Wiring these to an alerting channel is an operational task, not built here.)
8. **No automatic tracked→untracked** — never scripted. Part F explains why; the register tracks a *controlled* deactivation design as a separate decision.

## Part B — Disposable cutover rehearsal

- **B.1 Isolated DB** — `mfg_rehearsal` built by replaying **all 128 migrations into an empty database** (bootstrap = non-public schemas from a schema-only dump; `public` dropped and rebuilt by the chain). Result: **128/128 applied cleanly** (migration integrity ✓), 22 manufacturing tables, `manufacturing_settings` defaults `release_enabled=false, allocation_enabled=false`, RLS enabled on `orders`/ledgers/manufacturing tables, **no anon/authenticated write grants on any ledger or manufacturing table** (`apply_stock_movement` granted to `service_role` only). The one non-ledger grant seen (`orders | authenticated | UPDATE`) is pre-existing, RLS-constrained commerce. No secrets or real customer PII copied; the primary dev DB was not touched.
- **B.2 Physical classification** — demonstrated on a synthetic *Kashmiri Chai — Glass 190 g* in the isolated DB: 35 counted on-hand classified as 30 verified-eligible / 3 quarantine / 2 unknown. Legacy stock is held in a **typed `legacy` batch container** (no production identity), with the human sign-off recorded in `variant_legacy_reconciliation` — **no fabricated manufacturing history**. (Full legacy-opening *overlay* accounting is the deferred Phase-12 build; this rehearsal demonstrates classification + the epoch cutoff, not a complete legacy ledger.)
- **B.3 Cutover** — authorised sequence proven: reconcile legacy sign-off → verify `activation_eligible` → `activate_variant_tracking('tracked')` (stamps immutable epoch) → enable switches. **Epoch classification proven:** all pre-activation movements fall before the epoch (exempt from attribution); the first unattributed post-epoch tracked movement is **rejected** (fail-closed, aggregate unchanged). Concurrency at the cutover boundary is serialised by the variant `FOR UPDATE` lock in `activate_variant_tracking` and every writer.
- **B.4 Stock writers after activation** — the full matrix (batch release, partial/concurrent release, reservation/expiry, paid sale, mixed tracked/untracked, multi-batch, bundle lines, cancellation, refund, payment exception, reallocation, manual adjustment, return, RTO, quarantine, hold/recall, substitution, pick/dispatch) is exercised with conservation checks across the phase-7A/8/9/10 suites **plus** the new 11B scenarios. After every writer, aggregate stock, batch balances, overlay sums and exception state are checked **independently** (recomputed from raw ledger/overlay, not from the reconciliation RPC). **No unexplained discrepancy was found.**

## Part C — Exception & recovery scenarios

Each row: what the system recorded, what it blocked, the recovery, the accounting result, and the remaining human responsibility. "Proven in" cites the automated evidence.

| # | Scenario | Recorded / blocked | Recovery | Accounting | Operator responsibility | Proven in |
|---|---|---|---|---|---|---|
| 1 | Payment captured, no eligible batch | Paid; **durable** `order_inventory_exceptions` (captured_unallocated); fulfilment blocked | reallocate when eligible, or refund | drift explained; `fully_reconciled=false` | resolve the exception | `saleAllocation` #7/#A1; `phase11bRehearsal` |
| 2 | Hold placed during checkout | Held batch skipped by eligibility → shortfall exception | reallocate after hold lifts | explained | review hold | `saleAllocation` #13-16 |
| 3 | Recall during batch release | `release_batch` refused (`recall_state<>none`) | release after containment lifts (manager + validation) | no stock created | recall handling | `release_batch` body; `phase9Recalls` |
| 4 | Recall between pick and dispatch | Dispatch gate blocks; contained units → quarantine on reverse | re-pick from eligible batch | provenance frozen pre-dispatch | investigate shipment | `phase8`/`phase9` suites |
| 5 | Duplicate payment / refund callbacks | Idempotent — second `finalize` is a no-op; refunds keyed | none needed | no double deduction | none | `saleAllocation` #5; `phase11bRehearsal` |
| 6 | Partial refund, ambiguous quantities | Return holds ambiguous units; nothing invented | operator scan/attribution | explained via exception/hold | attribute units | `returnsRtoRefund` |
| 7 | Stock reconciliation mismatch | `variant_batch_reconciliation` surfaces drift / `physical_consistent=false` | investigate; compensating entry if justified | honest, not hidden | triage | `phase11bRehearsal` (hazard) |
| 8 | Missing / incorrect batch attribution | Deferred trigger **rolls back** an unattributed tracked movement | fix attribution, retry | fail-closed | correct the pick | `phase11bRehearsal` boundary; `saleAllocation` #A3 |
| 9 | DB transaction interruption | Single-transaction functions roll back atomically; no partial state | re-run (idempotent) | consistent | re-run op | `rehearsal_dbboundary` |
| 10 | Temporary service/shipment-provider failure | Order/payment persist; dispatch retried | retry dispatch | unaffected | retry | fulfilment suites |
| 11 | Reservation expiry during finalisation | Finalize uses reservations under the order lock; expiry handled before/after atomically | re-run finalize | consistent | monitor | `finalize_order` body; `phase11bRehearsal` |
| 12 | Duplicate release / activation request | Idempotent (`release_batch` key; `activate` is a lock+set) | none | no double apply | none | `rehearsal_dbboundary` #4b |
| 13 | Concurrent manual adjustment + finalisation | Serialised by variant `FOR UPDATE`; both apply | none | conserved, non-negative | none | `phase11bRehearsal` |
| 14 | Invalid legacy-stock classification | `activation_eligible=false` while any open/refunded/write-off exception or missing sign-off | fix classification | blocks activation | complete sign-off | `phase11bRehearsal`; `returnsRtoRefund` |
| 15 | Attempted unsafe tracking deactivation | **No DB guard today** — permitted, and breaks `physical_consistent` (demonstrated) | never automate; design a controlled path | hazard shown | governance (Part F) | `phase11bRehearsal` (hazard) |

## Part F — Activation & rollback governance

| Property to confirm | Status | Note |
|---|---|---|
| Only the authorised procedure changes tracking state / switches | **Service layer: yes** (`activationService`, cap `manufacturing.activate` = super_admin only, not in any bundle). **DB layer: no hard gate** — `service_role` can write `manufacturing_settings` and call `activate_variant_tracking` directly. | acceptable (service_role = trusted server) but see next row |
| Prerequisite checks enforced at the correct DB boundary | **Partial.** The *attribution* boundary is hard-enforced (deferred trigger → no untagged consumption). The *activation-eligibility* precondition (`activation_eligible`, incl. legacy sign-off) is **not** enforced inside `activate_variant_tracking`; it is an operator/service governance step. The system's own `foundation` migration documents this as deferred to Phase 12. | **Recommendation:** add a guarded activation RPC that refuses `→tracked` unless `activation_eligible`, as Phase-12 hardening (not added now — it would change behaviour relied on by the test fixtures and is outside the inert scope). |
| Activation records immutable & auditable | **Yes.** `variant_tracking_epochs` is append-only (no non-owner UPDATE/DELETE); every switch/tracking change writes an audit event. | — |
| Emergency disablement cannot permit untagged consumption | **Yes.** With a variant tracked, disabling allocation fail-closes finalize (proven). The one hazard is a `tracked→untracked` flip, which *would* permit untagged consumption — hence it must never be automated and should become a guarded, reconciled, operator-only path. | see register #12 |
| Recovery preserves legitimate payments/orders/movements/shipments | **Yes.** Pause + idempotent forward recovery; no restore needed. | Part A.3 |
| No production activation performed | **Confirmed.** Switches false, no real variant tracked, nothing pushed/deployed. | — |

**Three separate, non-interchangeable approvals** (each a distinct human decision):
1. **Deployment approval** — ship the code/migrations to an environment. Changes software, not data or inventory behaviour (everything stays inert).
2. **Data-migration approval** — apply additive schema/migrations to a specific database. Changes structure, not live inventory.
3. **Inventory-activation approval** — enable switches and/or set a real variant `tracked` (per-variant, with the Section-B prerequisites met). This is the only one that changes live stock behaviour, and is super-admin-gated.

Granting one never implies the others.
