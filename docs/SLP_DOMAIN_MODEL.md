# Samorah Commerce Platform — Reference Domain Model

> **Living document.** The single reference for *what exists, how it changes, who may
> change it, and where the boundaries are.* Every new module is designed against this
> and updates it. If the code and this doc disagree, that is a bug in one of them.
>
> Companion docs: [`SLP_COVERAGE.md`](./SLP_COVERAGE.md) (principle-by-principle status),
> [`SLP_ARCHITECTURE.md`](./SLP_ARCHITECTURE.md), [`SLP_V1_FUNCTIONAL_SPEC.md`](./SLP_V1_FUNCTIONAL_SPEC.md).

Samorah has moved past "an e-commerce site" into a **modular commerce platform**: a
storefront + a set of back-office modules (Orders, Fulfillment, Returns, Notifications,
Settings…) that share one domain model and communicate through an immutable event stream.

---

## 1. Module boundaries

Modules are separated by **who operates them** and **what kind of decision they make** —
never mixed on one screen (SLP principles a/c: warehouse never performs financial ops).

| Module | Operator | Owns | Must NOT do |
|---|---|---|---|
| **Storefront** | customer | browse, cart, checkout, pay | any back-office write |
| **Fulfillment Board** | Warehouse | physical workflow (pick→pack→QC→dispatch), triage (priority/assign/tags/hold) | cancel, refund, pricing |
| **Order Management** | CS / Finance | commercial cancellation, refunds, payment view | move the physical workflow |
| **Returns** *(next)* | Warehouse + CS | return lifecycle (request→inspect→restock→refund/replace) | — (spans both, gated per action) |
| **Notifications** *(engine)* | system | fan every business event to email/WhatsApp/SMS/push | contain business logic |
| **Configuration** | Admin | settings, business rules, warehouses, packaging, providers | per-order operations |
| **Insights** | Manager+ | analytics, audit trail, exports | any write |

**Cross-cutting capabilities** (relied on by many modules, built early): **Permissions**,
**Notifications**, the **Audit-Event stream**, and the **Work-Queue model**.

---

## 2. Entities

| Entity | Table | Purpose | Notes |
|---|---|---|---|
| Order | `orders` | the commercial + fulfillment record | carries both `status` (coarse) and `fulfillment_status` (fine) |
| Order line | `order_items` | immutable line snapshot w/ per-line GST/HSN | source of truth for invoice + restock |
| Shipment | `shipments` | provider-agnostic dispatch record | one active per order (today) |
| Refund | `refunds` | refund ledger (one row per attempt) | over-refund guarded in DB; `status` initiated→processing→processed/failed |
| Reservation | `stock_reservations` | pre-payment stock hold | consumed → real stock decrement at finalize |
| Fulfillment job | `fulfillment_jobs` | async side-effect queue | job types: email, shipping, dispatch_email, cancellation_email → **subsumed by Notifications** |
| Audit event | `audit_events` | immutable business-event stream | timestamp · actor · prev→new · event · notes · metadata |
| Return | `returns` / `return_items` | reverse lifecycle | ✅ ties order·inventory(restock)·refund(ledger)·audit; reverse shipping + emails next |
| Notification dispatch | `notification_dispatches` | per-recipient, per-channel dispatch log | ✅ idempotent per (order, event, channel, recipient) |
| **Capability grant** *(planned)* | code table first, DB later | role→capability mapping | see §5 |

---

## 3. State machines

All transitions go through a pure `assertTransition` guard; terminal states have no successors.

**Order status** (`orders.status`, `src/lib/orderState.ts`)
```
pending → confirmed → processing → packed → shipped → delivered → returned
   └────────────────── cancelled ──────────────────┘        └→ rto
```

**Fulfillment status** (`orders.fulfillment_status`, `src/lib/fulfillment/state.ts`)
```
reserved → picking → picked → packing → packed → qc_passed → ready_for_dispatch
        → courier_assigned → picked_up → shipped
  qc_passed → qc_failed (rework)          any → on_hold → (prior state)     any → cancelled
```

**Shipment / Exception / Return** state machines live in `src/lib/{shipping,exceptions,returns}/state.ts`.

**Refund** (ledger `refunds.status`): `initiated → processing → processed | failed`.
Order money summary (`refund_amount`, `payment_status`) is recomputed from **processed** rows only.

**Return** *(planned)* — `requested → approved → in_transit → received → inspected → closed`,
with `rejected` and `cancelled` exits. `inspected` fans out to restock (inventory) + refund/replacement.

---

## 4. Event taxonomy

Two related streams. **Audit events** record *what happened* (immutable history).
**Notification events** are the subset that should reach a human.

| Event | Emitted by | Audit | Notifies customer |
|---|---|---|---|
| `order.confirmed` | persistOrder | ✅ | ✅ confirmation |
| `order.dispatched` / `shipment.dispatched` | shipmentService | ✅ | ✅ dispatch |
| `order.cancelled` | cancellationService | ✅ | ✅ cancellation |
| `refund.initiated/processed/failed` | refundService | ✅ | ⬜ (refund email — via engine) |
| `delivery.completed` *(planned)* | courier webhook | ✅ | ✅ delivery |
| `return.requested/approved/received/closed` *(planned)* | returnService | ✅ | ✅ return updates |
| `fulfillment.*` (picking…shipped, on_hold, resumed, priority_set, assigned, tagged) | fulfillmentService | ✅ | ⬜ internal |

**Rule:** business services emit events; they never call an email builder directly. The
**Notification Engine** subscribes to notifying events and fans out per channel (§ build order).

---

## 5. Permissions — capability-based

Roles are **groups of capabilities**, not the unit of authorization. Code checks a capability,
never a role rank directly. New roles = new capability bundles, no route changes.

**Capabilities**
```
fulfillment.operate    pick/pack/qc/ready/hold/resume/create-shipment/dispatch
fulfillment.triage     priority / assign / tags / notes
order.cancel           commercial cancellation
order.refund           issue / view refunds
returns.operate        receive / inspect / restock
returns.approve        approve / reject a return (financial consequence)
catalog.manage         products / inventory
rules.manage           business rules
shipping.configure     providers / warehouses / packaging / settings
analytics.view         dashboards / audit trail
data.export            CSV / report export
users.manage           roles / staff
```

**Role → capability map** (initial)
| Role | Capabilities |
|---|---|
| `editor` (Warehouse) | fulfillment.operate, fulfillment.triage, returns.operate |
| `manager` (CS/Finance) | + order.cancel, order.refund, returns.approve, analytics.view, data.export |
| `admin` | + catalog.manage, rules.manage, shipping.configure, users.manage |
| `super_admin` | all |

**Implementation plan:** `src/lib/auth/capabilities.ts` — `CAPABILITIES`, `ROLE_CAPABILITIES`,
`hasCapability(role, cap)`. Server guard `requireCapability(cap)` replaces scattered
`requireStaff("manager")`. Middleware still gates the `/admin` *path* at editor+; capabilities
gate *actions*. UI hides controls the caller lacks the capability for.

---

## 6. Business rules (invariants)

1. **Webhook = order source of truth.** All money side-effects idempotent on `idempotency_key`.
2. **Cancel ≠ refund.** Separate actions, separate events; refund is always explicit.
3. **Over-refund impossible.** DB sums non-failed refunds under a row lock before accepting one.
4. **Money summary is derived,** never a running total — recomputed from processed refunds.
5. **Restock only from `order_items`** on a paid cancellation; pending orders just free holds.
6. **One primary action per board row;** commercial/financial actions never on the board.
7. **Effective priority = max(manual, computed).** Staff override always wins upward.
8. **Every state change emits an audit event** with actor + prev→new.
9. **Notifications fan from events,** not from the action that caused them.

---

## 7. Work-queue model (principle 10)

The Fulfillment Board is *one view* of an underlying queue model. Warehouses divide by function,
so the reader supports a **derived `queue` filter** even before separate screens exist:

| Queue | Predicate (derived) |
|---|---|
| Ready to Pick | fulfillment ∈ {reserved, picking} |
| Ready to Pack | fulfillment ∈ {picked, packing} |
| Ready to Ship | fulfillment = ready_for_dispatch (no shipment) |
| Exceptions | fulfillment = qc_failed OR inventory = missing |
| On Hold | fulfillment = on_hold |
| Returns *(planned)* | return ∈ open states |

No new storage — queues are predicates over existing state, so a future per-queue screen is a
filter, not a migration.

---

## 8. Bulk operations (principle 11 — design only)

Deferred, but the model must not preclude it. Shape:
`select rows → batch endpoint → iterate the existing single-item op (idempotent) → collect results`.
Batchable ops: **assign**, **set priority/tags**, **print slip/label**, **create shipments**,
**dispatch**. Each already exists as a single-item, idempotent operation, so bulk is a fan-out
wrapper + a selection model in the UI — no domain change required.

---

## 9. Operational metrics (principle 12)

Computed from `audit_events` timestamp deltas (the stream already stamps every transition):
- **Avg pick time** = mean(`fulfillment.picked` − `fulfillment.picking`)
- **Avg pack time** = mean(`fulfillment.packed` − `fulfillment.packing`)
- **Oldest waiting order** = max age of awaiting-fulfillment orders
- **Orders waiting / on hold / refund queue** = live counts

---

## 10. Adopted build order (principle 14)

Cross-cutting capabilities first, so later modules don't duplicate logic:

1. ~~**Permission System** — capability-based (§5)~~ ✅
2. ~~**Notification Engine** — centralized event fan-out (§4)~~ ✅
3. ~~**Returns Module** — the integrative business module (§3)~~ ✅
4. **Shipment Management** — read/label/track surface  ← next
5. **Settings / Business Rules** UI
6. **Packaging Management** UI
7. **Warehouses** UI
8. **Analytics** (builds on the metrics in §9)

Board/order **refinements** (Commercial-Cancellation naming, Next-Action hint, Effective Priority,
refund sub-states, inventory states, work-queue filter, dashboard metrics) land as a first pass
before module #1.

---

## 11. Naming / domain decisions

- **Commercial Cancellation** is the umbrella for all order cancellations. The *reason* is typed —
  `cancellation_type ∈ {customer, warehouse_exception, fraud, admin}` — so analytics can split
  them while the workflow, refund logic, and email stay one path.
- **Effective Priority** (Critical/High/Normal) is what the board sorts on; **manual priority**
  (VIP/Urgent/High/Normal) is an operator input, and `effective = max(manual, computed)`.
- **Inventory signal** is per-line: Reserved (pre-pay) · Allocated (paid) · Picking (in progress) ·
  Missing (short/oversold) · Backordered (*dormant* until pre-orders are allowed).
