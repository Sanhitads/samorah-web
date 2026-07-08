# SLP — Coverage Matrix (what's built vs pending)

Status of every engine / module / point against the current codebase. Keep this in
sync as slices land. Legend: ✅ built · 🟡 partial · ⬜ not built.

## The 4 engines
| Engine | Status | Where | Notes |
|---|---|---|---|
| 1 · Packaging | ✅ (multi-box ⬜) | `lib/packaging/*`, `config/packaging.ts` | Structure + wired; real measurements + multi-box pending |
| 2 · Shipping | ✅ Manual (adapters ⬜) | `lib/shipping/*` | Interface + Manual live; Shiprocket/Delhivery/India Post pending creds |
| 3 · Fulfillment | 🟡 | `lib/fulfillment/state.ts`, `lib/orderState.ts`, `lib/shipment/state.ts` | State machines ✅; dashboard + packing workflow ⬜ |
| 4 · Notification | 🟡 | `lib/email/*`, `lib/notifications/triggers.ts` | Email ✅; WhatsApp/SMS/push ⬜ |

## Points A–K
| Pt | Item | Status | Where / pending |
|---|---|---|---|
| A | Packaging Profiles | ✅ | `packaging_profiles` + `config/packaging.ts` |
| B | Shipping Rules | ✅ (data ⬜) | `lib/rules/engine.ts` + `business_rules` table (empty) |
| C | Volumetric Weight | ✅ | `config/logistics.volumetricWeightKg`, packaging calc |
| E | Shipping Weight | ✅ | `computeParcel` (net + packaging) |
| F | Box Dimensions | ✅ | `packaging_assets` L/W/H → parcel dims |
| G | Pickup Address | ✅ | `warehouses` table + `warehouseService` |
| H | Courier Preferences | ✅ (data ⬜) | `decideCourier(preferred)`; `courier_capabilities` empty |
| K | Return Rules | 🟡 | Returns engine ✅ (`lib/returns/state.ts`); reason→action rules via business-rule engine (data ⬜) |

## Module 1 — Fulfillment Core
| Item | Status | Where / pending |
|---|---|---|
| Order State Machine | ✅ | `lib/orderState.ts` |
| Shipment State Machine | ✅ | `lib/shipment/state.ts` |
| Fulfillment State Machine | ✅ | `lib/fulfillment/state.ts` (reserved→…→shipped, QC gate) |
| Fulfillment Dashboard | ⬜ | **NEXT** — admin UI + auth |
| Packing Workflow | 🟡 | states exist; no service/UI to drive pick→pack→QC yet |
| Dispatch Workflow | ✅ | `markShipmentDispatched` + `/api/fulfillment/dispatch` + `ORDER_DISPATCHED` |

## Module 2 — Packaging Engine
| Item | Status | Where / pending |
|---|---|---|
| Packaging Assets | ✅ | `packaging_assets` (+ inventory cols) |
| Packaging Profiles | ✅ | `packaging_profiles` / `_items` |
| Packaging Rules | ✅ | `packaging_rules` (select/modifier) |
| Weight Calculator | ✅ | `computeParcel` (net/packaging/shipping) |
| Dimension Calculator | ✅ | box dims from the chosen profile |
| Volumetric Weight | ✅ | `/5000` divisor (settings-configurable) |
| Multi-box Packing | ⬜ | single box/order today; `shipments.unique(order_id)` to relax |
| Packaging Cost | ✅ | `estimatedPackagingCostInr` → shipment `packaging_cost` |
| Packaging Inventory | ✅ | `inventory.ts` (low/reorder); levels are data ⬜ |
| Recommendation → confirm | ✅ | `recommend.ts` + `shipments.packaging_confirmed` |

## Module 3 — Shipping Engine
| Item | Status | Where / pending |
|---|---|---|
| Shipping Provider Interface | ✅ | `lib/shipping/provider.ts` |
| Manual Provider | ✅ | `lib/shipping/providers/manual.ts` |
| Shiprocket Adapter | ⬜ | needs sandbox EMAIL/PASSWORD |
| Delhivery Adapter | ⬜ | future contract |
| India Post Adapter | ⬜ | future |
| Future Providers | ✅ | factory + env/settings selection ready |

## Module 4 — Courier Decision Engine
| Item | Status | Where / pending |
|---|---|---|
| cheapest | ✅ | `decideCourier("cheapest")` |
| fastest | ✅ | `decideCourier("fastest")` |
| preferred | ✅ | `decideCourier("preferred", order)` |
| luxury | ✅ | `decideCourier("luxury")` |
| insurance (capability) | ✅ | `capableCouriers` (supportsInsurance) |
| fragile | ✅ | `capableCouriers` (fragileOk) |
| COD support | ✅ | `capableCouriers` (supportsCod) |
| serviceability | ✅ | zone/pincode-prefix filter |
| — data | ⬜ | `courier_capabilities` empty; strategy=manual until couriers added |

## Module 5 — Tracking Engine
| Item | Status | Where / pending |
|---|---|---|
| webhook processing | ⬜ | courier webhook → `add_shipment_event` (needs adapter/creds) |
| manual updates | ✅ | `addShipmentEvent` |
| customer timeline | ✅ | `/order/[n]/track` + `toCustomerStatus` |
| delivery proof (POD) | ⬜ | capture signature/photo on delivery |
| RTO | 🟡 | `rto` status exists; no RTO workflow/entity |
| exceptions | ✅ | `shipment_exceptions` + `lib/exceptions/state.ts` |

## Module 6 — Analytics
| Metric | Status | Data ready? |
|---|---|---|
| Average Delivery Time | ⬜ | yes — `shipment_events` timestamps |
| Courier Cost | ⬜ | yes — `shipments.courier_cost` |
| RTO Rate | ⬜ | yes — shipment status |
| Damage % | ⬜ | yes — exceptions (courier_damaged) |
| Lost % | ⬜ | yes — exceptions (lost) |
| Average Shipping Cost | ⬜ | yes — cost columns |
| Packaging Cost | ⬜ | yes — `packaging_cost` |
| Profit After Shipping | ⬜ | yes — order total − `total_logistics_cost` |
| Courier Performance | ⬜ | yes — per-provider aggregates |
| State-wise Delivery Time | ⬜ | yes — `ship_state` + timestamps |
| COD % | ⬜ | yes — `payment_mode` |

**Analytics is not built, but every metric's DATA foundation exists** — it's an
aggregation/reporting slice, no new capture needed.

## Summary
- **Fully built:** all state machines (order/shipment/fulfillment/exception/return),
  Packaging Engine (assets/profiles/rules/weights/dims/cost/inventory/recommend),
  Shipping abstraction + Manual provider, Courier Decision Engine (logic), Cost
  Engine, Business Rule Engine, Warehouses, Shipping Settings, Tracking timeline +
  customer page, Email notifications (confirmation + dispatch), and the wiring of
  these into `createShipmentForOrder`.
- **Partial:** Fulfillment (needs dashboard + packing workflow), Notification
  (needs multi-channel senders), Return rules, RTO workflow.
- **Not built (by design / awaiting input):** Fulfillment Dashboard (NEXT),
  Multi-box packing, Shiprocket/Delhivery/India Post adapters, courier tracking
  webhook, delivery proof, Analytics, and all DATA (real packaging measurements,
  courier capabilities, business rules, packaging inventory levels).
