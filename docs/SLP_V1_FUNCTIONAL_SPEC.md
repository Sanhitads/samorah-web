# SLP v1 — Functional Specification (the contract)

The single specification the Samorah Logistics Platform is built against. It defines
every entity, state transition, event, interface, action, webhook, notification, and
business rule. Implementation happens in slices; **nothing here rewrites what exists**
— items are tagged **[BUILT]**, **[PARTIAL]**, or **[PLANNED]**.

Architecture (enterprise-shaped): **Orders → Inventory → Fulfillment → Shipping →
Tracking → Notification → Analytics.** Shipping only begins after Fulfillment is
complete (§14).

---

## 1. Engines & responsibilities
| Engine | Owns | Status |
|---|---|---|
| Inventory | stock, reservations, availability, oversell guard | [BUILT] reservations; [PLANNED] warehouse-level stock |
| **Fulfillment** (umbrella — §13) | picking, packing, **packaging**, QC, dispatch handoff, warehouse workflow | [PARTIAL] |
| ↳ Packaging (sub-engine) | assets, profiles, rules, weight/volumetric calc | [BUILT] structure + admin UI (/admin/packaging) + live DB catalog drives packing |
| Shipping | provider interface, create/cancel/track/label/pickup/estimate, courier decision | [BUILT] Manual; [PLANNED] adapters + decision |
| Tracking | provider status → unified timeline, POD, RTO, exceptions | [BUILT] timeline |
| Notification | event → email/WhatsApp/SMS/push | [BUILT] email; [PLANNED] multi-channel + triggers |
| Analytics | cost, delivery time, RTO/damage/lost %, profit-after-shipping | [PLANNED] |

---

## 2. Database entities
Existing (do not change; extend only):
- **orders** [BUILT] — header + snapshots + GST + payment + status.
- **order_items** [BUILT] — immutable line snapshots (+ composition_id).
- **shipments** [BUILT] — provider, status, awb, courier, tracking/label url, weights
  (net/packaging/shipping/volumetric/chargeable), dims, payment_mode, cod, cost.
- **shipment_events** [BUILT] — immutable tracking timeline.
- **fulfillment_jobs** [BUILT] — queue: email · shipping · dispatch_email.
- **packaging_assets / packaging_profiles / packaging_profile_items / packaging_rules** [BUILT].
- **payment_attempts / webhook_logs / stock_reservations / counters** [BUILT].

Planned (additive tables):
- **warehouses** [BUILT — /admin/warehouses + region routing (serves_states) wired into shipments] — id, name, address, gstin, manager, phone, working_hours,
  priority, active. *(config WAREHOUSES exists; promote to table.)* — §Missing 2.
- **packaging_assets** += current_stock, min_stock, reorder_level, purchase_cost, vendor
  [PLANNED] — §Missing 3.
- **courier_capabilities** [PLANNED] — provider, courier, supports_cod, supports_insurance,
  fragile_ok, dangerous_goods_ok, max_weight_kg, max_length_cm, pickup_sla_hrs, zones. — §Missing 4.
- **shipping_settings** [PLANNED] — singleton: default_provider, auto_assign, insurance_threshold,
  cod_threshold, default_warehouse_id, fragile_policy, volumetric_divisor, working_days,
  holiday_calendar. Admin-editable. — §Missing 11. [BUILT — /admin/settings]
- **business_rules** [BUILT — /admin/rules] — trigger, condition (jsonb), action (jsonb), priority, active.
  Generalises packaging_rules. — §Missing 12.
- **shipment_costs** [PLANNED] (or columns on shipments) — courier_cost, packaging_cost,
  insurance, cod_fee, fuel_surcharge, tax, total_logistics_cost. — §Missing 9.
- **returns / return_events** [PLANNED] — reverse-logistics module (own state machine). — §Missing 8.
- **shipment_exceptions** [PLANNED] — typed exceptions (delayed/lost/address/…). — §Missing 7.
- **notification_triggers** [PLANNED] — event → channels + template. — §Missing 10.

---

## 3. State machines

### 3.1 Order status [BUILT] (`lib/orderState.ts`)
`pending → confirmed → processing → packed → shipped → delivered`; exits `cancelled`,
`returned`, `rto`. Terminal: cancelled/returned/rto.

### 3.2 Shipment status [BUILT] (`lib/shipment/state.ts`)
`pending → ready_to_ship → shipment_created → courier_assigned → label_generated →
pickup_scheduled → picked_up → in_transit → out_for_delivery → delivered`; exits
`cancelled` (pre-pickup), `rto`, `exception` (recoverable). Customer map:
Preparing / Shipped / In Transit / Out for Delivery / Delivered / Returned / Exception / Cancelled.

### 3.3 Fulfillment status [PLANNED] — §Missing 1 (finer than order/shipment)
`reserved → picking → picked → packing → packed → qc_passed → ready_for_dispatch →
courier_assigned → picked_up → shipped`; QC gate before dispatch. Sits between order
`confirmed` and shipment creation.

### 3.4 Return status [PLANNED] — §Missing 8
`requested → approved → pickup_scheduled → received → qc → refund → closed`; branch
`rejected`. Separate from forward shipping.

### 3.5 Exception status [PLANNED] — §Missing 7
Types: `delayed | lost | address_incorrect | customer_unavailable | courier_damaged |
rejected | returned`. Each: `open → investigating → resolved | escalated`. First-class,
not notes.

---

## 4. Events
- **Domain events**: order.confirmed, order.packed, order.shipped, order.delivered,
  order.cancelled; shipment.created, shipment.dispatched, shipment.delivered,
  shipment.exception, shipment.rto; return.requested…closed; payment.captured/failed.
- **Tracking events** [BUILT]: rows in `shipment_events` (status, customer_status,
  description, location, source). Every provider status normalises to one of these.

---

## 5. Provider interface [BUILT] (`lib/shipping/provider.ts`)
```
estimateShipping(RateRequest) → RateQuote[]
createShipment(ShipmentRequest) → ShipmentResult
cancelShipment(id) → { ok }
trackShipment(awb|id) → TrackingResult   (unified status + events[])
generateLabel(id) → { ok, labelUrl }
schedulePickup(id) → { ok, pickupId, scheduledFor }
```
Implementations: Manual [BUILT]; Shiprocket / Delhivery / Blue Dart / India Post [PLANNED].

---

## 6. Courier Capability Matrix + Shipping Strategy — §Missing 4 & 5 [PLANNED]
`courier_capabilities` declares what each courier supports (COD, insurance, fragile,
DG, max weight/length, pickup SLA, serviceable zones). The **Courier Decision Engine**
picks a courier from a strategy: `luxury | fastest | cheapest | preferred | manual`.
Example: `IF luxury → Blue Dart ELSE cheapest → Shiprocket ELSE Manual`. The Shipping
Engine then executes the chosen provider — selection is data, not code.

---

## 7. Business Rule Engine — §Missing 12 [BUILT — admin CRUD + dry-run at /admin/rules]
General `trigger → condition → action` (generalises packaging_rules):
- `IF order.total > ₹3000 → add insurance`
- `IF gift → packaging profile C`
- `IF payment=COD → courier=Delhivery only`
- `IF city=Bengaluru → manual local delivery`
Rules are data (admin-editable); the business changes without a deploy.

---

## 8. Cost model — §Missing 9 [PLANNED]
Per shipment: courier_cost + packaging_cost + insurance + cod_fee + fuel_surcharge +
tax = total_logistics_cost. Feeds Analytics → accurate profit-per-order.

---

## 9. Notification triggers — §Missing 10 [PLANNED]
`notification_triggers`: event → channels (email/WhatsApp/SMS/push) → template.
Built today: ORDER_CONFIRMATION [BUILT], ORDER_DISPATCHED [BUILT] (email only).
Declared kinds: PAYMENT_SUCCESS, PAYMENT_FAILED, ORDER_DELIVERED, RETURN_*, EXCEPTION_*,
PASSWORD_RESET, MAGIC_LINK, WELCOME, NEWSLETTER.

---

## 10. Admin actions
[BUILT] trigger dispatch (`/api/fulfillment/dispatch`). [PLANNED] fulfillment dashboard:
start picking, mark picked, start packing, select/confirm packaging, pass QC, mark ready,
assign courier, print label, schedule pickup, mark dispatched, raise exception, approve
return, issue refund, edit warehouse/assets/rules/settings, view analytics.

## 11. Customer actions
[BUILT] view order confirmation, track shipment, download tax invoice. [PLANNED] request
return, report an issue, reschedule delivery, choose delivery slot.

## 12. Webhooks
[BUILT] Razorpay payment webhook (signed, idempotent). [PLANNED] courier tracking webhook
(Shiprocket/Delhivery) → normalise → `add_shipment_event`; delivery/RTO/exception updates.

---

## 13. Fulfillment umbrella (§Missing 13) — NO rewrite
Conceptually the **Fulfillment Engine** contains Picking · Packing · **Packaging** · QC ·
Dispatch. In code the existing **Packaging Engine remains a sub-module** under this
umbrella — we adopt the model in the spec and folder naming going forward, not by
renaming built code.

## 14. Sequencing (§Missing 14)
**Shipping starts only after Fulfillment is complete** (QC passed → ready_for_dispatch).
Today shipment auto-creates on payment for speed; a `shipping_settings.auto_assign`
flag + the fulfillment state machine will gate it so QC precedes dispatch.

---

## Roadmap — the 14 gaps as prioritized slices
1. Fulfillment state machine + jobs (§1) · admin dashboard (§10).
2. warehouses table (§2), packaging inventory + reorder (§3).
3. shipping_settings (admin config, §11) + business_rules generalisation (§12).
4. courier_capabilities (§4) + Courier Decision / Shipping Strategy (§5).
5. Shiprocket adapter + courier tracking webhook (§5/§12) — needs creds.
6. Exception management (§7) + Returns engine (§8).
7. Cost model (§9) + Notification triggers/multi-channel (§10) + Analytics.
8. Packaging recommendation → human confirm (§6).

Each slice is additive and verified before the next. This document is the contract they
build against.

---

## Wired into the live flow (createShipmentForOrder) — [DONE]
- §11 settings → provider selection (`shipping_settings.default_provider`).
- §3/§6 Packaging Engine → parcel weights/dimensions + packaging cost (via the
  EXAMPLE catalog until real data).
- §12 business rules → actions at shipment creation (`add_insurance`, `set_provider`).
- §9 cost engine → persisted breakdown (courier/packaging/insurance/COD/fuel/tax/total)
  on the shipment.
- §14 gate present (`auto_create_after_fulfillment`, default OFF).

## PENDING — awaiting DATA, CREDENTIALS, or a future slice
These are intentionally deferred. The engines/interfaces exist; only the input below
is missing. Filling them is a **data or adapter change, not a redesign.**

**Awaiting real packaging DATA (from Samorah):**
- Real box weights & dimensions + per-variant **net product weights** (wax+jar+lid+label).
  Replace `EXAMPLE_PACKAGING_CATALOG` + `PLACEHOLDER_NET_WEIGHT_G` (config/packaging.ts,
  config/logistics.ts). Until then, parcel weights/costs are indicative.
- Additional packaging **rules** (e.g. 4+ products, per-vessel boxes) + capturing the
  **gift flag** at checkout so `PackContext.isGift` is real.
- Packaging **inventory levels** (current/min/reorder) entered into `packaging_assets`.

**Awaiting CREDENTIALS:**
- **Shiprocket adapter** (`ShiprocketProvider implements ShippingProvider`) — auth,
  serviceability, create-shipment, AWB, pickup — needs sandbox EMAIL/PASSWORD.
- **Courier tracking webhook** (Shiprocket/Delhivery) → normalise → `add_shipment_event`.
- Delhivery / Blue Dart / India Post adapters (as contracts are signed).
- WhatsApp / SMS / push **notification senders** (email is live).

**Future slices (no external blocker):**
- **Courier capability DATA** (`courier_capabilities` empty) + strategy ≠ manual, so the
  Decision Engine (§5) actually chooses between couriers.
- **Business-rule DATA** (`business_rules` empty) — e.g. order>₹3000→insurance, COD→Delhivery.
- **Admin dashboard + auth**: fulfillment board (pick/pack/QC/dispatch), and CRUD for
  settings, rules, warehouses, packaging assets, courier capabilities, exceptions, returns.
- **§14 full gate**: drive `orders.fulfillment_status` through the fulfillment workflow so
  the ready-to-ship gate is meaningful (then enable `auto_create_after_fulfillment`).
- **Analytics Engine** (§ roadmap 7) — cost/delivery-time/RTO/damage/profit dashboards.
- Multi-channel notification wiring via `notification_triggers` once senders exist.
