# Samorah Logistics Platform (SLP) — Architecture

**Principle:** Samorah owns the logistics *workflow*; every courier is a replaceable
*adapter*, never baked into business logic. We build a **Shipping Platform**, not a
"Shiprocket integration". Dependency inversion: fulfillment depends on the
`ShippingProvider` interface, not on any vendor.

```
Order
  ↓
Fulfillment Engine   (pick / pack / dispatch — vendor-agnostic)
  ↓
Packaging Engine     (box / inserts / weight / dimensions — courier-agnostic)
  ↓
Shipping Engine      (ShippingProvider interface)
  ↓
┌───────────────────────────────────────────────┐
│ Manual · Shiprocket · Delhivery · Blue Dart …  │  ← adapters (replaceable)
└───────────────────────────────────────────────┘
  ↓
Tracking Engine      (normalises every courier → ONE customer timeline)
  ↓
Notification Engine  (order / dispatch / delivery — already provider-agnostic)
  ↓
Analytics Engine     (cost / performance / RTO / damage / profit)
```

## The six engines (each has ONE reason to change)
| Engine | Owns | Never knows |
|---|---|---|
| Packaging | box, inserts, weights, dimensions, fragile, multi-box | couriers |
| Shipping | create/cancel/track/label/pickup/estimate via provider interface | how goods are packed |
| Fulfillment | pick, pack, dispatch, warehouse workflow | which courier |
| Tracking | webhook + manual updates → unified timeline, POD, RTO, exceptions | provider specifics |
| Notification | email/WhatsApp/SMS, customer tracking comms | manual vs automatic shipping |
| Analytics | delivery time, courier cost, RTO %, damage %, profit-after-shipping | — |

## Shipping Provider Interface (the stable core)
Every provider implements the same contract, so swapping providers doesn't touch
the rest of the app:
```
estimateShipping(RateRequest)   → RateQuote[]
createShipment(ShipmentRequest) → ShipmentResult   (providerShipmentId, awb, courier, trackingUrl, labelUrl)
cancelShipment(id)              → { ok }
trackShipment(awb|id)           → TrackingResult    (unified status + events[])
generateLabel(id)               → { ok, labelUrl }
schedulePickup(id)              → { ok, pickupId, scheduledFor }
```
`ManualShippingProvider` implements all of it with no external dependency —
so Samorah can **launch on manual/self-ship today** and add Shiprocket later by
dropping in one adapter.

## Shipment state machine (unified across couriers)
```
pending → ready_to_ship → shipment_created → courier_assigned → label_generated
        → pickup_scheduled → picked_up → in_transit → out_for_delivery → delivered
exits:  cancelled (pre-pickup) · rto · exception (recoverable)
```
`lib/shipment/state.ts` enforces allowed transitions. The **Tracking Engine** maps
each provider's raw statuses onto a small **customer-facing** set:
`Preparing → Shipped → In Transit → Out for Delivery → Delivered` (+ Exception / Returned),
so the customer timeline is identical no matter who carries the parcel.

## Data model (planned)
- `warehouses` — dynamic pickup locations (id, name, address, GSTIN, phone, hours, active).
- `packaging_assets` — every physical packing item as inventory (outer box, rigid box,
  mailer, pouch, gift box, tissue, foam…) with L·W·H, weight, max weight, max products,
  fragile, cost, vendor, barcode, active.
- `packaging_profiles` — chosen configurations composed of assets.
- `packaging_rules` — Samorah business rules (1 candle → Profile A; ceramic → +bubble;
  room spray → leak-seal; gift box → Profile C). These belong to Samorah, not a courier.
- `shipments` — one per parcel: order_id, warehouse_id, provider, status, awb, courier,
  tracking_url, label_url, weights (net/packaging/shipping/volumetric/chargeable),
  dimensions, payment_mode, cod_amount, insurance, cost, provider refs, timestamps.
- `shipment_events` — immutable status history (the tracking timeline).
- `shipping_config` — provider priority by zone/segment, insurance rules, COD rules,
  return rules — all configurable, none hardcoded.

## Weight pipeline (never overwrite one value with another)
```
Net product weight (wax + jar + lid + label)
  + Packaging weight (box + inserts)
  = Shipping weight
Volumetric weight = (L × W × H) / 5000   [computed AFTER packaging is chosen]
Chargeable weight = max(Shipping weight, Volumetric weight)
```
Each is stored separately.

## Build order (one module per step, verified before the next)
1. **Shipping abstraction + state machines** ✅ *Slice 1 (this pass)* — interface,
   Manual provider, factory, shipment state machine, config scaffold. Pure + tested,
   no creds/dimensions needed.
2. **Shipment DB + history + persistence** — tables + write-through from the worker.
3. **Packaging Engine** — assets → profiles → rules → weight/volumetric calculator.
4. **Fulfillment + Tracking** — workflow, admin dashboard, unified timeline, customer
   tracking page, `ORDER_DISPATCHED` email.
5. **Courier Decision Engine + Shiprocket/Delhivery adapters** — needs sandbox creds +
   real parcel weights/dimensions.
6. **Analytics** — once order volume exists.

## Needs external input before it can go live
Live rate estimation · external shipment/AWB creation · pickup scheduling · webhook
testing — all wait on **Shiprocket sandbox credentials** + **real packaging
weights/dimensions**. Everything else is built and tested against the Manual provider.
```
```
