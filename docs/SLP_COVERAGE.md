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
| Tracking | 🟡 | timeline ✅; live courier tracking ⬜ (webhook/adapter) |
| Labels | 🟡 | interface method ✅; real label generation ⬜ (adapter) |
| Courier status | 🟡 | `trackShipment` interface ✅; real feed ⬜ |

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

### B. Shipping Rules = **Business Rules** ✅ (data ⬜)
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

### G. Pickup Address → dynamic **Warehouse** 🟡
Warehouse entity (id, name, address, GST, phone, pickup hours, active) ✅
(`warehouses` + `warehouseService`). **Order → warehouse ROUTING (which warehouse
fulfils an order) NOT built** ⬜ — currently always the default warehouse.

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

### L. Packaging Database — four separate things ✅
Packaging Assets ✅ · Packaging Profiles ✅ · Packaging Rules ✅ · Packaging Inventory ✅
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
- **M5 Tracking:** manual updates ✅, customer timeline ✅, exceptions ✅; **webhook ⬜,
  delivery proof (POD) ⬜, RTO workflow 🟡**.
- **M6 Analytics:** all 11 metrics ⬜ (every metric's DATA foundation exists).

---

## Consolidated gap list (build queue)
**Logic/engine gaps (no external blocker):**
1. ✅ DONE — Fulfillment Dashboard + auth · Packing Workflow (drive pick→pack→QC→ready→dispatch)
2. Full auto-gated Shipping Workflow (point M) — dashboard drives it manually today;
   enabling `auto_create_after_fulfillment` for hands-off gating is the remaining bit
3. Multi-box packing (Engine 1 / M2)
4. Net-weight sub-components: wax/jar/lid/label per variant (point D)
5. Order → warehouse routing (point G)
6. Courier segment-priority matrix: Metro/Remote/Luxury/Heavy (point H)
7. Insurance tiers with an "optional" band (point I)
8. COD rules: blocked pincodes, prepaid-only products, max-value enforcement (point J)
9. Returns: Replacement / Exchange outcomes + RTO↔return linkage (point K)
10. Tracking: delivery proof (POD), RTO workflow
11. Analytics engine (11 metrics — data-ready)

**Awaiting DATA (from Samorah):** real packaging measurements + per-variant net
weights, courier capabilities + segment priorities, business-rule data, insurance/COD
config values, packaging inventory levels.

**Awaiting CREDENTIALS:** Shiprocket/Delhivery/India Post adapters, courier tracking
webhooks, WhatsApp/SMS/push senders.
