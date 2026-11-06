# SAMORAH — Batch-Code Convention & Prefix Correction (proposal, approval-gated)

**Agreed format:** `[FRAGRANCE]-[VESSEL/FORMAT]-[YYMMDD]-[SEQUENCE]` — e.g. `KC-G190-261201-01`.

## Why the current codes differ
The generator is **correct**; the defect is **data** (`products.batch_prefix`):
- `batch_code = upper(batch_prefix) || '-' || batch_format_code(vessel,size,type) || '-' || YYMMDD || '-' || seq`.
- `batch_format_code` is right: glass→`G`, ceramic→`C`, candle (no vessel)→`C`, + size digits; room→`R…ML`, linen→`LN…ML`. So `G190`, `C150`, `C100`, `G100` are **correctly derived from the variant**, not wrong — do not change them.
- The prefix is wrong: two real products were **polluted by old test code** (the pre-isolation `qcLifecycle` set `"Q"+uuid` on the real candle product it picked), and the rest were never set:

| Product | base_sku | current `batch_prefix` | issue |
|---|---|---|---|
| Kashmiri Chai | SAM-CAN-001 | `T6A33` | test-polluted |
| Rainforest Bloom | SAM-CAN-009 | `QED19` | test-polluted |
| Exotic | SAM-CAN-002 | `null` | never set → cannot create batches |
| Wild Majestic | SAM-CAN-004 | `null` | never set |
| Whispered Flame | SAM-CAN-007 | `null` | never set |
| Bout Of Rain | SAM-CAN-008 | `null` | never set |
| Fresh Fold (linen) | SAM-LNN-001 | `null` | never set |
| After Lights (linen) | SAM-LNN-002 | `null` | never set |
| Open Window (room) | SAM-ROOM-001 | `null` | never set |
| Slow Evening (room) | SAM-ROOM-002 | `null` | never set |

## Record categories (so real vs test is unambiguous)
1. **Real catalog prefixes** — belong on the 10 `status='active'` products above (the target of this correction).
2. **Test-product prefixes** — random/initial-letter codes (`SALE…`, `L10…`, `P12…`, `Q…`, `T…`) on disposable `is_active=false` products created by the suite. Not real.
3. **Variant format identifiers** — `G190/C150/R100ML/…`, derived by `batch_format_code`; correct.
4. **Existing immutable batch codes** — never change (DB trigger enforces immutability); this correction affects **future** batches only.

## Approved mapping — **codes APPROVED by the user; applied only in an isolated DB so far**
Uniqueness verified (none of the 10 codes is used by any product). The correction is scripted and **tested in
an isolated database** ([batch_prefix_correction.sql](./batch_prefix_correction.sql) — deliberately NOT in
`supabase/migrations`, so it cannot auto-apply). **Applying it to the production catalogue needs a separate
data-migration approval.** Future batches only; existing immutable batch codes/history are untouched.

| base_sku | product | before → after |
|---|---|---|
| SAM-CAN-001 | Kashmiri Chai | `T6A33` → **KC** |
| SAM-CAN-002 | Exotic | `null` → **EX** |
| SAM-CAN-004 | Wild Majestic | `null` → **WM** |
| SAM-CAN-007 | Whispered Flame | `null` → **WF** |
| SAM-CAN-008 | Bout Of Rain | `null` → **BR** |
| SAM-CAN-009 | Rainforest Bloom | `QED19` → **RB** |
| SAM-LNN-001 | Fresh Fold | `null` → **FF** |
| SAM-LNN-002 | After Lights | `null` → **AL** |
| SAM-ROOM-001 | Open Window | `null` → **OW** |
| SAM-ROOM-002 | Slow Evening | `null` → **SE** |

### Original proposal (candle formats, for reference)

| Fragrance | Proposed prefix | Supported formats (from real variants) |
|---|---|---|
| Kashmiri Chai | **KC** (confirmed) | G100, G190, C100, C150 |
| Exotic | EX | C100, C200 |
| Wild Majestic | WM | G100, G200, C100, C200 |
| Whispered Flame | WF | G100, G200, C100, C200 |
| Bout Of Rain | BR | G100, G190, C100, C150 |
| Rainforest Bloom | RB | G100, G200, C100, C200 |
| Fresh Fold (linen spray) | FF | LN…ML |
| After Lights (linen spray) | AL | LN…ML |
| Open Window (room spray) | OW | R…ML |
| Slow Evening (room spray) | SE | R…ML |

Example after correction: Kashmiri Chai 190 g glass → `KC-G190-261201-01`.

## Smallest safe correction (future batches only) — NOT YET APPLIED
`products.batch_prefix` is immutable via the service once batches exist, so the two polluted products need an owner-level update. Existing (test) batch codes are untouched. **This changes real-product data, so it is gated on (a) your confirmation of the codes and (b) a production data-migration approval.** The null-prefix products are also a prerequisite for those products to ever create batches.

```sql
-- APPROVAL-GATED: run only after confirming the prefix codes. Future batches only; existing codes immutable.
-- update public.products set batch_prefix='KC' where base_sku='SAM-CAN-001';  -- Kashmiri Chai (was T6A33)
-- update public.products set batch_prefix='EX' where base_sku='SAM-CAN-002';  -- Exotic (was null)
-- update public.products set batch_prefix='WM' where base_sku='SAM-CAN-004';  -- Wild Majestic
-- update public.products set batch_prefix='WF' where base_sku='SAM-CAN-007';  -- Whispered Flame
-- update public.products set batch_prefix='BR' where base_sku='SAM-CAN-008';  -- Bout Of Rain
-- update public.products set batch_prefix='RB' where base_sku='SAM-CAN-009';  -- Rainforest Bloom (was QED19)
-- update public.products set batch_prefix='FF' where base_sku='SAM-LNN-001';  -- Fresh Fold
-- update public.products set batch_prefix='AL' where base_sku='SAM-LNN-002';  -- After Lights
-- update public.products set batch_prefix='OW' where base_sku='SAM-ROOM-001'; -- Open Window
-- update public.products set batch_prefix='SE' where base_sku='SAM-ROOM-002'; -- Slow Evening
```

The generator is verified by `batchCodeConvention.integration.test.ts` (glass 190g → `PREFIX-G190-YYMMDD-01`, ceramic 150g → `PREFIX-C150-…`, and the `batch_format_code` mappings). No existing batch code, history, or linked record is modified by this proposal.
