# SAMORAH — Editorial PDP Architecture (Phase 9)

> Design first, UI second. This document defines the **reusable editorial block
> system** and the **content flow** for Product Detail Pages, so Candle and Air
> PDPs share one component library but compose **different storytelling
> sequences** — the same idea as the Chapter / Air templates, applied to products.
> Goal: closer to Diptyque · Trudon · Aesop than to a WooCommerce product page.

---

## 1. Principle — a PDP is an editorial composition, not a section list

A PDP is **two layers**:

```
┌─ Commerce header  (FIXED — Beat 1, unchanged) ────────────────┐
│   Gallery · Collection · Name · Tagline · Theme · Scent Group │
│   · Price · Vessel · Size · Add to Bag   (sticky)             │
└──────────────────────────────────────────────────────────────┘
┌─ Editorial sequence  (COMPOSED — the Block Engine) ───────────┐
│   an ordered list of reusable Editorial Blocks, filled from   │
│   the product, alternating rhythm — a fragrance journal       │
└──────────────────────────────────────────────────────────────┘
```

The commerce header stays exactly as built (it's perfect). Everything **below**
it becomes a **composed sequence of reusable Editorial Blocks** — "same engine,
different order," exactly like Chapters.

**No new engine.** The editorial sequence reuses the existing platform:
- **Section Engine** — each Editorial Block is a registered `SectionType` with a
  component; rendered by `SectionRenderer` inside `SectionShell` (which already
  gives theme token · spacing · background · reveal).
- **Template Engine** — `CANDLE_PDP_TEMPLATE` and `AIR_PDP_TEMPLATE` declare the
  **order** of blocks per product type (versioned, rule-checked, like the others).
- A **builder** (`buildProductEditorial(product, kind)`) composes the template +
  fills each block's `settings` from the product view-model — exactly how
  `buildChapterPage` fills chapter sections.

So the PDP route renders: `<ProductHeader/>` (Beat 1) + `<SectionRenderer
sections={buildProductEditorial(...)} context={...}/>`.

---

## 2. The Editorial Block Library  (reusable `SectionType`s)

Generic, content-agnostic blocks. Each reads its own `settings` (filled by the
builder) and is **reused across product types** wherever the shape fits.

Names are **product-agnostic** so diffusers, melts, incense, perfumes and gift
sets reuse them tomorrow.

| Block (`SectionType`) | Settings (contract) | What it is |
|---|---|---|
| **EditorialStatement** | `eyebrow · heading · body[] · media? · align` | A large editorial paragraph beside one image. *The Story Within · The Experience.* |
| **ImageStory** | `eyebrow? · caption? · media · align` | A single image with a small caption — a quiet visual beat (e.g. a process image). |
| **FragrancePyramid** | `eyebrow · heading · intro? · layers[{label,notes[]}]` | The animated Top/Heart/Base pyramid (not an accordion). *Fragrance Journey · Scent Structure.* |
| **NotesColumn** | `eyebrow · heading · notes[]` | Large-type stacked notes. *Smells Like.* |
| **PoeticLines** | `eyebrow · lines[]` | Short lines read like verse. *Feels Like.* |
| **EditorialQuote** | `quote · attribution? · variant` (hairline · handwritten) | One centred sentence, huge whitespace. *Signature Line · the artist's line · quote moments.* |
| **ArtistFeature** | `eyebrow · name · role? · story[] · media · align` | Layout A — a process image on one side, the artist's story on the other. *The Artist Behind This Candle.* |
| **ArtworkFeature** | `media · caption?` | Layout B — a **full-width** artwork, edge to edge, no surrounding UI. A gallery pause. |
| **MoodGrid** | `eyebrow · heading · cards[{label,value}]` | Editorial cards — Mood · Flame Persona · Theme. *Scent Mood.* |
| **CraftDetails** | `eyebrow · heading · items[{icon?,label,value}]` | Hand-poured → wax → wick → burn → vessel, minimal icons. *Craft & Composition.* |
| **PlacementGrid** | `eyebrow · heading · items[{icon?,label}]` | Where it belongs — bedroom · living · workspace. *Placement · Lifestyle "where".* |
| **LifestyleFeature** | `eyebrow · heading · media? · rows[{label,value}] · align` | Image + where/when/pairs-with. *Lifestyle Use Case.* |
| **EditorialAccordion** | `items[{title,body}]` | Collapsed details. *Care & Safety · Shipping · Product Details.* |
| **RelatedProducts** | `eyebrow · heading · products[]` | Reuses **`ProductCard`** + the shared `ChapterRail` browse. *Continue the Chapter · Continue the Hours.* |

**Shared by both PDPs:** EditorialStatement · ImageStory · FragrancePyramid ·
EditorialQuote · EditorialAccordion · RelatedProducts · PlacementGrid.
**Candle-leaning:** ArtistFeature · ArtworkFeature · MoodGrid · CraftDetails ·
LifestyleFeature. **Air-leaning:** NotesColumn · PoeticLines.

### The Artist as a reusable block sequence

The artist experience is **not one component** — it's a sequence of reusable
blocks, so any product can compose it (or part of it):

```
ArtistFeature   "The Artist Behind This Candle"  (caption · process image · story)
ArtworkFeature  full-width painting, edge to edge, generous whitespace
EditorialQuote  "Every colour begins with a feeling."  (handwritten)
```

Artist content lives once in **`config/artist.ts`** (`Artist`: name · role · story
· portrait · processImages · artworkImages · signature · quote · cta); a product
references an **`artistId`** rather than embedding copy, so Artist A / B / C all
work later with no changes.

### Visual density is part of the rhythm

Not every block has the same weight. The sequence **breathes** — Statement →
large Image → minimal Text → Craft grid → huge Quote → Artist → Artwork →
Lifestyle → Accordion. Feature blocks carry an `align` (image-left / image-right)
the builder **alternates**; `ArtworkFeature` and `EditorialQuote` are the
full-bleed / whitespace page-turns; a hairline `Divider` separates movements.
Every page turn should feel different.

---

## 3. The two templates — same blocks, different order

**`CANDLE_PDP_TEMPLATE`** — the editorial book of a candle:

```
EditorialStatement   "The Story Within"
FragrancePyramid     "Fragrance Journey"  (Top · Heart · Base)
ArtistFeature        "Meet the Artist Behind This Candle"
MoodCards            "Scent Mood"  (Mood · Flame Persona · Theme)
SignatureQuote       — the cultural reference, as one line
CraftList            "Craft & Composition"
LifestyleFeature     "Lifestyle"  (where · when · pairs)
EditorialAccordion   "Candle Care & Safety" · "Shipping & Exchanges"
ProductRail          "Continue the Dessert Chapter"
```

**`AIR_PDP_TEMPLATE`** — the diary of an hour (no artist / persona / wax):

```
EditorialStatement   "The Hour"  (07:10 · Fresh Fold · story)
NotesColumn          "Smells Like"  (large type)
PoeticLines          "Feels Like"
EditorialStatement   "The Experience"  (how the room changes)
PlacementGrid        "Placement"  (bedroom · living · workspace · guest)
SignatureQuote       "Signature Line"  — one beautiful sentence
EditorialAccordion   "Product Details" · "Shipping"
ProductRail          "Continue The Hours Collection"
```

Adding a future product type = a new template + (mostly) existing blocks. Adding
a beat to an existing type = reorder the template. **No component changes.**

---

## 4. The builder & content mapping

`buildProductEditorial(product, kind)` → `SectionInstance[]`:
- picks `CANDLE_PDP_TEMPLATE` or `AIR_PDP_TEMPLATE` by `kind`;
- fills each block's `settings` from the product view-model (and, for Air, the
  Hour entry) — `ArtistFeature` from the artist record, `FragrancePyramid` from
  `fragrance_notes`, `CraftList` from wax/wick/burn, `MoodCards` from
  flame-persona/mood-tags/collection, `ProductRail` from `getRelatedProducts`;
- assigns `align` alternately to the feature blocks;
- hides a block when its content is absent (the empty-strategy pattern), so a
  product without an artist or without notes simply omits that beat — the page
  still reads intentionally.

Data gaps today (e.g. **artist** content, candle **moodTags**/persona already
exist; Air hour data lives in `config/theHours.ts`) are filled from config or
left to gracefully omit until seeded — same approach as the chapters.

---

## 5. What this reuses (and what's new)

**Reused:** Section Engine (registry · renderer · `SectionShell` · error
boundary), Template Engine (versioned templates + composition rules), the
`RenderContext`, `AssetImage`, `ParallaxMedia`, `ProductCard` + `ChapterRail`,
the theme tokens, `lib/pricing` / `lib/product`, the motion tokens, the
co-located CSS-layer pattern.

**New:** ~12 Editorial Block components (registered into the existing library) ·
two PDP templates · `buildProductEditorial` · a small artist content source ·
`styles/pdp-editorial.css`.

**Theming:** the commerce header stays `warm-ivory` (clean commerce); the
editorial blocks inherit the product's **chapter palette** (clay / forest / … ;
monsoon for Air) via the RenderContext, so the PDP feels like the chapter it
belongs to.

---

## 6. Build plan (once approved)

- **Beat 2a — Block engine + shared blocks:** register the block types; build
  EditorialStatement · FragrancePyramid · SignatureQuote · EditorialAccordion ·
  ProductRail; `buildProductEditorial` + the two templates; wire the Candle PDP
  end-to-end with the shared blocks.
- **Beat 2b — Candle-specific blocks:** ArtistFeature · MoodCards · CraftList ·
  LifestyleFeature; the artist content source; full Candle editorial flow.
- **Beat 2c — Air PDP:** NotesColumn · PoeticLines · PlacementGrid; the Air PDP
  route (`/shop/[slug]` resolves a room/linen spray to the Air flow) + Air hour
  data wiring.
- **Beat 3 — polish:** alternating-rhythm tuning, pyramid animation, gallery
  thumb-switching, responsive, micro-interactions.

---

*Principle: Composition over Templates · Editorial before Commerce · Every
Component CMS-ready · Build for the Next Five Years.*
