# SLP — Coverage Matrix (built vs partial vs pending)

Authoritative status of every engine responsibility, point (A–M), and module against
the codebase. Keep in sync as slices land. Legend: ✅ built · 🟡 partial · ⬜ not built.

---

## Engine responsibilities (decoupling contract)
### Engine 1 — Packaging (never knows Shiprocket ✅)
| Responsibility | Status | Where / pending |
|---|---|---|
| What box to use | ✅ | `selectPackaging` (rules → profile) |
| What inserts are needed | ✅ | profile items (tissue/filler/wrap) |
| Total shipping weight | ✅ | `computeParcel` (net + packaging) |
| External dimensions | ✅ | box asset L/W/H |
| Fragile handling | ✅ | modifier rule (ceramic → bubble wrap) |
| Multi-box packing | ⬜ | single box/order today |

### Engine 2 — Shipping (doesn't know how products are packed ✅)
| Responsibility | Status | Where / pending |
|---|---|---|
| Creating shipments | ✅ | `provider.createShipment` + `create_shipment` |
| Selecting provider | ✅ | settings + `getShippingProvider` + Decision Engine |
| Tracking | ✅ | timeline + admin lifecycle (in-transit→OFD→delivered/exception/RTO); provider-agnostic **webhook** `/api/webhooks/shipping/[provider]` maps raw→unified. Real courier adapter still ⬜ |
| Labels | 🟡 | interface + `regenerateLabel` (provider.generateLabel) wired; real label images need an adapter ⬜ |
| Courier status | ✅ | webhook ingest + `mapProviderStatus`; live feed needs a real courier adapter ⬜ |

### Engine 3 — Fulfillment (doesn't know which courier ✅)
| Responsibility | Status | Where / pending |
|---|---|---|
| Picking | ✅ | dashboard drives `reserved→picking→picked` (`/admin/fulfillment`) |
| Packing | ✅ | dashboard drives `packing→packed→QC→ready` |
| Dispatch | ✅ | `markShipmentDispatched` + endpoint |
| Warehouse workflow | 🟡 | warehouse model ✅; routing/workflow ⬜ |

### Engine 4 — Notification (doesn't care manual vs auto ✅)
| Responsibility | Status | Where / pending |
|---|---|---|
| Emails | ✅ | provider-agnostic; confirmation + dispatch |
| WhatsApp | ⬜ | channel declared; sender pending |
| SMS | ⬜ | channel declared; sender pending |
| Customer tracking | ✅ | `/order/[n]/track` |

---

## Points A–M
### A. Packaging Profiles → **Packaging Assets** ✅
Every packing item is inventory (ID, name, type, H/W/L, weight, max weight, max
products, fragile, cost, vendor, barcode, active). ✅ `packaging_assets` has all
fields; type covers outer/rigid/mailer/pouch/gift/insert/tissue/foam/filler/wrap/
tape/leak_seal. Real asset data ⬜.

### B. Shipping Rules = **Business Rules** ✅ (admin CRUD + dry-run at `/admin/rules`; seed data still ⬜)
1 candle→A, 2→B, gift→C, ceramic→+bubble, spray→leak. ✅ `packaging_rules`
(select/modifier) + general `business_rules`. Example rules in the placeholder
catalog; real rule data ⬜.

### C. Volumetric Weight ✅
Computed AFTER packaging is chosen (Products → Packaging → Actual Weight →
Dimensions → Volumetric → Chargeable). ✅ exactly this order in `computeParcel`.

### D. Product Weight — split, never overwrite 🟡
Weight split into Net / Packaging / Shipping / Volumetric / Chargeable — **separate
columns, computed independently** ✅. **Net-weight sub-components (wax + jar + lid +
label) NOT modelled** ⬜, and real per-variant net weight is a placeholder ⬜.

### E. Shipping Weight ✅
The value handed to any provider. ✅ (`shipping_weight_kg` / `chargeable_weight_kg`).

### F. Box Dimensions ✅
External dims stored (couriers charge on these). ✅ (asset L/W/H → shipment dims).

### G. Pickup Address → dynamic **Warehouse** ✅
Warehouse entity (id, name, address, GST, phone, pickup hours, active) ✅ + **admin
UI** `/admin/warehouses` (CRUD, set-default, guardrails). **Order → warehouse
ROUTING ✅** — `routeWarehouse` (pure, tested): region routing over `serves_states`,
else highest-priority active; wired into `createShipmentForOrder` so shipments pick
up from the routed warehouse (not a hardcoded default). Routing preview in the UI.

### H. Courier Preferences 🟡
`decideCourier("preferred", order)` supports a priority list ✅. **Segment-based
priority matrix (Metro / Remote / Luxury / Heavy each with their own courier order)
NOT modelled as data** ⬜; `courier_capabilities` empty ⬜.

### I. Insurance Rules 🟡
Single `insurance_threshold` (≥ ₹3000 → insured) + `add_insurance` business action ✅.
**Tiered bands (₹0–1000 none · ₹1000–3000 OPTIONAL · ₹3000+ mandatory) NOT
modelled** ⬜ — no "optional" tier / customer choice.

### J. COD Rules 🟡
COD fee (flat + %) in the cost engine ✅; `cod_threshold` setting ✅; capability
`supportsCod` ✅. **NOT built:** max COD value enforcement 🟡, **blocked pincodes ⬜**,
**prepaid-only products ⬜**. COD is not yet offered at checkout (all prepaid).

### K. Return Rules 🟡
Returns state machine ✅ (requested→approved→pickup→received→qc→refund→closed) +
reasons (damaged/wrong_item/not_as_described/changed_mind/defective) ✅. Lost shipment
→ exceptions ✅. **NOT built:** **Replacement / Exchange outcomes** (only Refund
modelled) ⬜, **RTO ↔ return linkage** 🟡, manufacturing-defect vs courier-damage
routing ⬜.

### L. Packaging Database — four separate things ✅ (+ admin UI + live catalog)
Packaging Assets ✅ · Packaging Profiles ✅ · Packaging Rules ✅ · Packaging Inventory ✅
**Admin UI at `/admin/packaging`** (Assets/Profiles/Rules tabs, stock adjust, low-stock
flags, dashboard reorder KPI). The engine now packs against the **DB catalog**
(`getPackagingCatalog`), falling back to config only while unseeded — so entered
measurements drive real parcel weights/dims/cost. FK-restrict blocks deleting an
in-use asset. Seed measurements still ⬜ (DATA from Samorah).
(all distinct entities). Inventory LEVELS are data ⬜.

### M. Shipping Workflow (18 steps) 🟡
The STATES exist across the order / fulfillment / shipment machines
(reserved→picking→picked→packaging-selected→packed→qc→ready→shipment-created→courier-
assigned→label→pickup→in-transit→out-for-delivery→delivered→completed). **The
end-to-end ORCHESTRATION is NOT driven** ⬜ — today payment auto-creates the shipment,
skipping pick/pack/QC/weight-verify. Needs the Packing Workflow + full §14 gate.

---

## Modules 1–6 (summary)
- **M1 Fulfillment Core:** Order/Shipment/Fulfillment state machines ✅; Dispatch ✅;
  **Dashboard ✅** (`/admin/fulfillment`, staff-gated); **Packing Workflow ✅**
  (pick→pack→QC→ready→create-shipment→dispatch, order status auto-synced).
- **M2 Packaging:** assets/profiles/rules/weight/dimension/volumetric/cost ✅;
  **Multi-box ⬜**.
- **M3 Shipping:** interface ✅, Manual ✅, factory ✅; **Shiprocket/Delhivery/India
  Post ⬜**.
- **M4 Courier Decision:** cheapest/fastest/preferred/luxury/insurance/fragile/COD/
  serviceability logic ✅; **capability + segment-priority DATA ⬜**.
- **M5 Tracking:** manual updates ✅, customer timeline ✅, exceptions ✅, **webhook ✅
  (provider-agnostic ingest + status map), POD ✅ (delivered_to/pod_note + delivery
  email), RTO ✅ (order→rto sync)**. Real courier adapter ⬜; reverse-pickup shipment
  for returns ⬜.
- **M6 Analytics:** ✅ `/admin/analytics` (analytics.view) — revenue (gross/net/AOV/
  units), fulfillment (pick/pack/cycle), delivery (avg time · RTO% · exception%),
  logistics (shipping cost · revenue-after-shipping), returns (rate + reasons),
  refunds, per-courier performance; time-window filter (7/30/90/all). All derived
  from the audit stream + orders/shipments/returns/refunds. Meaningful once volume exists.

---

## Consolidated gap list (build queue)
**Logic/engine gaps (no external blocker):**
1. ✅ DONE — Fulfillment Dashboard + auth · Packing Workflow (drive pick→pack→QC→ready→dispatch)
2. Full auto-gated Shipping Workflow (point M) — dashboard drives it manually today;
   enabling `auto_create_after_fulfillment` for hands-off gating is the remaining bit
3. Multi-box packing (Engine 1 / M2)
4. Net-weight sub-components: wax/jar/lid/label per variant (point D)
5. ~~Order → warehouse routing (point G)~~ ✅ DONE — region routing (`serves_states` → warehouse) wired into shipment creation; admin UI + preview
6. Courier segment-priority matrix: Metro/Remote/Luxury/Heavy (point H)
7. Insurance tiers with an "optional" band (point I)
8. COD rules: blocked pincodes, prepaid-only products, max-value enforcement (point J)
9. Returns: Replacement / Exchange outcomes + RTO↔return linkage (point K)
10. Tracking: delivery proof (POD), RTO workflow
11. ~~Analytics engine (11 metrics)~~ ✅ DONE — /admin/analytics (revenue · fulfillment · delivery RTO/exception · logistics · returns+reasons · refunds · courier perf; window filter)

**Awaiting DATA (from Samorah):** real packaging measurements + per-variant net
weights, courier capabilities + segment priorities, business-rule data, insurance/COD
config values, packaging inventory levels.

**Awaiting CREDENTIALS:** Shiprocket/Delhivery/India Post adapters, courier tracking
webhooks, WhatsApp/SMS/push senders.

---

## Design Principles v2 (23) — module separation & operational UX
Ownership (do not blur): **Fulfillment** = warehouse execution only · **Order
Management** = cancellations + commercial/financial · **Shipping** = courier ·
**Returns** = reverse logistics · **Analytics** = consumes events from all.

**Cross-cutting rules**
| # | Rule | Status |
|---|---|---|
| a | Fulfillment Board is a warehouse tool, not order management | ✅ (Cancel removed from board) |
| b | All providers implement one Shipping Provider Interface | ✅ |
| c | Warehouse staff never perform financial operations | ✅ (no Cancel/refund on board) |
| d | Every business action generates an audit event | ✅ `audit_events` stream — order.confirmed, fulfillment.*, shipment.created/dispatched, hold/resume all write via `logEvent` (non-blocking) |
| e | Every customer notification is event-driven | ✅ **Notification Engine** — `notify(event, ctx)` fans out via subscriptions → per-channel template → provider; idempotent `notification_dispatches` log; email live (WhatsApp/SMS/push register as channels). Business services emit events, never build emails |
| f | Business rules configurable, not hardcoded | ✅ engines + **admin UI**: `/admin/settings` (shipping singleton, guardrails + audit) & `/admin/rules` (trigger→condition→action CRUD, typed-value coercion, dry-run tester) — change behaviour without a deploy |
| g | All logistics modules provider-independent | ✅ |

**Numbered principles**
| # | Principle | Status / gap |
|---|---|---|
| 1 | Board answers only "what's next for the warehouse" | ✅ (no order-mgmt/finance/analytics on board) |
| 2 | Simple visible flow, detailed internal state machine | 🟡 internal ✅; visible still shows granular labels (Start Picking/Mark Picked) |
| 3 | One primary action per row | ✅ (forward primary; Fail QC + Hold in ⋯) |
| 4 | ⋯ More: Hold/Resume/Report Exception/Request Cancellation/Reassign/Print slip/Print label/View Timeline | 🟡 Hold/Resume/Fail-QC ✅; the rest ⬜ |
| 5 | Hold: optional reason, resume to prior, no notify, no financial impact | ✅ (preset reasons ⬜) |
| 6 | Exception workflow (operational, pauses work, no payment impact) | 🟡 entity+SM exist (§7); board "Report Exception" + type alignment ⬜ |
| — | **Returns module** (integrative — review point 9) | ✅ `/admin/returns` RMA lifecycle; restock + refund + audit ties; capability split operate/approve; customer emails (requested/approved/rejected/refunded) via the Notification Engine |
| 7 | Business cancellation: Admin/CS only, confirm dialog, reason, optional release-inventory/refund/email | ✅ `/admin/orders` — manager+ only (editors view-only), `cancel_order` RPC (reason, optional restock, idempotent), confirm dialog, cancellation email queued |
| 8 | Refund workflow (Razorpay refund, async failures, cancel≠refund) | ✅ `refunds` ledger + `begin_refund`/`settle_refund` (DB over-refund guard, async status initiated→processing→processed/failed); Razorpay REST + manual fallback; cancel and refund are separate actions/events |
| 9 | Dedicated cancellation email (order#, reason, refund amount/status/timeline, support) | ✅ `buildCancellationEmail` — order#, reason, conditional refund block (amount + gateway/manual timeline), support line; unit-tested |
| 10 | Shipment workflow provider-independent; manual dispatches immediately; couriers via webhook | ✅ Manual; courier webhook ⬜ |
| 11 | Row context columns (Priority/Item Count/Tags/Assigned To/SLA/Payment Badge/Next Action) | ✅ board rows now carry Priority · Order+ItemCount · Tags · Customer · Fulfillment+Inventory · Payment · Age · Owner · Actions(Next) |
| 12 | Priority (Normal/High/Urgent/VIP) | ✅ manual `orders.priority` (editable) + computed **Effective Priority** (Critical/High/Normal) = max(manual, SLA/Express/Replacement/Complaint); board sorts on effective |
| 13 | Tags (Gift/Fragile/COD/Express/Replacement/Wholesale) | ✅ Gift/COD derived from is_gift/is_cod; Fragile/Express/Replacement/Wholesale editable via `TagsControl` → `ops_tags` |
| 14 | SLA indicators (order age + colour) | ✅ age from `placed_at`, colour ok(<24h)/warn(≥24h)/over(≥48h) |
| 15 | Customer notes inline (Gift Wrap/Leave at Reception/Call Before) | ✅ gift note + occasion + warehouse `ops_note` shown inline (📝); checkout-captured delivery instructions are a future storefront enhancement |
| 16 | Payment badge (Paid/COD/Refund Pending/Refunded) | ✅ badge from payment_status + is_cod (Paid/COD/Part. Refund/Refunded/Failed) + refund amount |
| 17 | Inventory status (Reserved/Allocated/Missing Stock) | ✅ Reserved (pre-pay) · Allocated (paid) · Picking (in progress) · Missing (oversold, flagged) · Backordered (modelled, dormant until pre-orders) |
| 11b | Next Action (explicit, not inferred) | ✅ `nextActionLabel` shows the single next step per row ("→ Create shipment"/"→ Dispatch"/"→ Resume") — review point 2 |
| 12b | Refund payment sub-states | ✅ Refund Initiated / Refund Processing / Part. Refunded / Refunded from the ledger — review point 4 |
| 10b | Work queues (derived) | ✅ Ready to Pick / Pack / Ship · Exceptions · On Hold as queue tabs (predicates over state, no new storage) — review point 10 |
| 18 | Immutable analytics event log (Picking Started…Refund Completed) | ✅ `audit_events` (append-only, RLS, service-role only) captures order/fulfillment/shipment events; cancellation/refund events land when Order Mgmt ships |
| 19 | Customer notifications (Confirmation/Dispatch/Delivery/Cancellation/Refund/Returns) | 🟡 Confirmation+Dispatch+Cancellation+Returns(requested/approved/rejected/refunded) ✅ via the engine; standalone Refund email + Delivery ⬜ |
| 20 | Role-based permissions (Warehouse/CS/Finance/Admin) | ✅ **capability-based** — `hasCapability`/`requireCapability`; roles = capability bundles (editor=Warehouse, manager=CS/Finance, admin, super_admin). Routes gate on capabilities (order.cancel/refund, fulfillment.operate/triage); UI hides controls the caller lacks; cancel-flow refund re-checks order.refund. Adding a role = data change, no route edits |
| 21 | Separate admin modules + nav (Dashboard/Orders/Fulfillment/Shipments/Returns/Customers/Catalog/Warehouses/Packaging/Rules/Providers/Settings/Analytics) | 🟡 admin shell + module-map sidebar + Dashboard landing (KPI tiles) ✅; live: Dashboard/Orders/Fulfillment; rest render "soon" (Shipments/Returns/Catalog/Warehouses/Packaging/Rules/Providers/Settings/Analytics) — build as their UIs land |
| 22 | Audit trail per transition/action (timestamp/user/prev/new/action/notes) | ✅ each row = timestamp · actor (staff.userId threaded from routes) · previous→new state · event · notes · metadata; `getOrderTimeline(orderId)` reads it back |
| 23 | Colour coding (Reserved 🟦/Picking 🟨/Packing 🟧/Ready 🟩/Exception 🟥/Cancelled ⚫) | 🟡 some status colours; not the exact semantic palette |

### Build queue implied by v2 (priority order)
1. ~~**Audit-event log** (d, 18, 22)~~ ✅ **DONE** — `audit_events` table + `record_audit_event` RPC + `auditService.logEvent`/`getOrderTimeline`; wired into order confirm, fulfillment advance/hold/resume, shipment create/dispatch, with staff actor attribution. Non-blocking (never breaks the business action). Cancellation/refund events attach when Order Mgmt ships.
2. ~~**Order Management module** (7, 8, 9)~~ ✅ **DONE** — `/admin/orders` (manager+; editors view-only) with confirm-dialog cancellation (reason, optional restock), a `refunds` ledger with a DB over-refund guard + async status, Razorpay-REST refunds with a manual fallback, and a dedicated cancellation email. Cancel ≠ refund (separate actions, separate audit events). Standalone refund email deferred to the notifications pass.
3. ~~**Board context columns** (11–17)~~ ✅ **DONE** — every board row now carries priority (editable, drives sort), item count, tags (Gift/COD derived + editable ops tags), assignee (assign-to-me), SLA age+colour, payment badge, gift/warehouse notes, and inventory status (Allocated/Missing). New `orders.priority/assigned_to/ops_tags/ops_note`; all edits audit-logged via the event stream.
4. 🟡 **Admin shell + nav** (21) — ✅ shell (`/admin/layout.tsx`) + module-map sidebar + Dashboard landing with KPI tiles; Dashboard/Orders/Fulfillment live, remaining modules render "soon". Still to build: Shipments, Returns, Settings/Rules/Warehouses/Packaging/Providers, Catalog, Analytics screens.
5. ~~**Board/order refinements** (review points 1–5, 10, 12)~~ ✅ **DONE** — Commercial Cancellation + `cancellation_type` taxonomy; explicit Next Action; Effective Priority; refund payment sub-states; extended inventory states; derived work-queue tabs; Dashboard operational metrics (avg pick/pack, oldest waiting). See [`SLP_DOMAIN_MODEL.md`](./SLP_DOMAIN_MODEL.md).

**Adopted build order (review point 14 — cross-cutting capabilities first):**
6. ~~**Permission System** (7/20)~~ ✅ **DONE** — `lib/auth/capabilities.ts` (12 capabilities, role→bundle map) + `requireCapability` guard; all admin routes gate on capabilities; UI hides uncapable controls; cancel-flow refund re-checks order.refund. Unit-tested.
7. ~~**Notification Engine** (8/e/19)~~ ✅ **DONE** — `lib/notifications/` (types, subscriptions, channels, engine) + `notification_dispatches` idempotent log; the fulfillment worker now emits `order.confirmed/dispatched/cancelled` events through `notify()` instead of building emails; new channels (WhatsApp/SMS/push) register without touching services. Refund/delivery/return templates plug in as events are added.
8. ~~**Returns Module**~~ ✅ **DONE** — `/admin/returns` + `returnService`: RMA lifecycle over the existing state machine, `return_items` (partial + restock flags), and the integrative ties — on settle it **restocks** inventory (`restock_return_items`, skipping damaged/defective) and issues a **refund** (via the ledger, once), writing every transition to the **audit** stream. Capability split: operate (warehouse) vs approve/refund (finance). Reverse-shipment scheduling + customer return emails plug into the shipment/notification engines next.
9. ~~**Shipment Management**~~ ✅ **DONE** — `/admin/shipments` post-dispatch lifecycle (in-transit → OFD → delivered w/ POD → `delivery.completed` email; exception/NDR w/ reason + reattempt; RTO w/ order sync; cancel; label). Provider-agnostic courier **webhook** `/api/webhooks/shipping/[provider]` (shared secret) maps raw→unified status and drives the same lifecycle. Real courier adapter + reverse-pickup shipment for returns are the remaining deferrals.
10. ~~**Settings/Business Rules** UI~~ ✅ **DONE** — `/admin/settings` (shipping singleton: provider/strategy/auto-assign/thresholds/fragile/volumetric/warehouse/working-days/holidays, with hard+soft guardrails + audit) & providers overview; `/admin/rules` (business-rule CRUD, typed-value coercion, active toggle, priority, **dry-run tester** against a sample order). Gated shipping.configure / rules.manage.
11. ~~**Packaging** UI~~ ✅ **DONE** — `/admin/packaging` (Assets/Profiles/Rules CRUD + inventory: stock adjust, low-stock flags, dashboard reorder KPI); engine reads the DB catalog (config fallback until seeded); FK-restrict guard on in-use assets. Seed measurements still ⬜ (DATA).
12. ~~**Warehouses** UI~~ ✅ · 13. ~~**Analytics**~~ ✅ **DONE** — the Insights module, deriving every metric from the modules built above.
14. **Delivery + courier webhook** (10, 19) — POD + delivery notification (needs adapter).
15. **Colour palette + simplified visible flow polish** (2, 23).

> Full reference architecture (entities · states · events · capabilities · rules · module boundaries · queue model · bulk-ops design): [`SLP_DOMAIN_MODEL.md`](./SLP_DOMAIN_MODEL.md).
