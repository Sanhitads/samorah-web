# SAMORAH — Manufacturing Operator & Browser Verification Procedure (honest)

**Status:** manual verification procedure. **Read this first:** the automated test suite does **not** exercise the browser UI through a real login. There is no automated admin authentication in the test harness, so no test clicks the admin screens, and this document does **not** claim browser E2E coverage. What the automated suites prove is the **service + database + API layer** (RBAC, RPCs, ledger integrity, gating, idempotency) — the same code the UI calls. The UI wiring (which service each button calls, and the capability each page requires) is verified by (a) component render tests and (b) the manual steps below, performed by a human operator.

## What is automated vs. what is manual

| Layer | How it's verified | Automated? |
|-------|-------------------|------------|
| Service functions, RPCs, ledger invariants, gating, idempotency, RBAC `requireCapability` | `*.integration.test.ts` against local Supabase | ✅ Yes |
| Admin API routes (action → service, actor from session not body) | Integration tests call the services; routes are thin and reviewed | ✅ Service layer; route is a thin wrapper |
| Component rendering (BatchDetail, LabelPreview, BatchLabels render without error, show the right warnings) | `*.rendered` component tests (jsdom) | ✅ Render only |
| Clicking through the real admin UI while logged in | **Manual steps below** | ❌ Not automated (no test login) |
| Physical printing / scanning | Manual (physical) | ❌ |

## RBAC note (capability → what the operator can do)

The UI shows/hides controls by capability, but the **server is authoritative** — every admin API route calls `requireCapability` and derives the actor from the session, never the request body. So even if a control were shown in error, the server refuses the action.

| Capability | Role floor | Controls it unlocks |
|------------|-----------|---------------------|
| `manufacturing.operate` | editor | create/update batch, record QC, generate & confirm labels |
| `qc` / `qc_approve` | editor / manager | record QC results / approve QC |
| `release` | manager | release an approved batch |
| `recall` | admin | create/transition recall cases, view affected customers (PII) |
| `activate` | **super_admin** | set a variant `tracked`, toggle switches |

## Manual browser procedure (run on local dev; never production)

Preconditions: local app running (`npm run dev`), logged in as a staff account with the capability under test, local Supabase up. Because activation switches default off, create a disposable tracked variant via the test fixtures (or a dev-only seed) before exercising release/label flows — do **not** track a real catalogue variant.

1. **Manufacturing list** — open `/admin/manufacturing`. Confirm the batch list renders, statuses are correct, and filters work.
2. **Batch detail & lifecycle** — open `/admin/manufacturing/<batchId>`. Walk a batch draft → in_production → curing → quality_check; confirm each transition button is present only for the right lifecycle state and the right capability.
3. **QC** — record a routine QC pass and a design validation; confirm approved/rejected quantities update and the approve-QC control appears only for a manager.
4. **Release** — with `release_enabled` on (dev only), release an approved batch; confirm the on-hand overlay updates and reconciliation shows fully reconciled.
5. **Labels** (the Phase 11A addition) — in batch detail, the **Labels** card appears when you have `manufacturing.operate`:
   - Pick a template; confirm **"(dims unverified)"** appears on unverified templates and a warning banner shows.
   - For a non-approved / held / recalled batch, confirm retail/product templates are refused server-side (error surfaced) while an internal template still generates.
   - Generate a printable; confirm the preview shows the human-readable batch code and that **encoded value == batch code** (a mismatch shows ✗).
   - Confirm the print history lists the job as **generated**; click **Mark printed**; confirm it flips to **printed** and that a re-click is idempotent (stays printed, no duplicate row).
   - Confirm generating/printing a label does **not** change lifecycle, QC, inventory, or recall state (re-open the batch; values unchanged).
6. **Fulfillment** — open `/admin/fulfillment`; confirm actual-batch pick confirmation, packing QC, and shipment provenance freeze; confirm a dispatched shipment's batch lines are frozen.
7. **Recalls** — open `/admin/recalls` as an admin; create a case, add a batch, initiate; confirm the batch's `recall_state` becomes recalled and that affected-customer PII is visible only under the recall capability.
8. **Negative RBAC check** — log in as a role **below** the capability floor (e.g. editor attempting release); confirm the control is hidden **and** that a direct API call is refused with 403 (the server gate, not just the hidden button).

## Reproducibility
- Service/DB/API: `npm run test:integration` (local DB required; guard fails closed against hosted DBs).
- Component render: `npm run test:unit` (includes `*.rendered` tests).
- Browser: the steps above, by a human, on local dev. Record operator, date, and any deviation. This is the honest status — the browser path is **not** machine-verified.
