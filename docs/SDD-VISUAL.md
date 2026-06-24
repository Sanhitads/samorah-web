# Samorah Visual SDD — V2 (Phase 5.5A)

> **Status:** v2.0 · Phase 5.5A · *Primary **visual** source of truth for all UI phases (6–10+).*
> **Source:** distilled from `samorah SDD VISUAL.pdf` (uploaded). That PDF holds the original mockups; this document is its build-facing distillation — one representative wireframe + tight annotations per major section, not a re-dump of all copy.
> **Relationship to the other docs:**
> - [`SDD.md`](./SDD.md) (v1.0) remains the **system reference** — colour tokens, type scale, spacing, container widths, motion curves, and component micro-specs (button/input/tag/accordion). V2 does **not** redefine those; it sits on top.
> - **Where they conflict, V2 wins** (the deltas are listed in §0.2 and reconciled inline).
> - [`SPD.md`](./SPD.md) owns photography. No UI is built until **both V2 and SPD are approved.**

Every section below follows the same four-part contract:
**◳ Wireframe** · **▸ Layout & behaviour** · **✶ Emotional intent** · **⊘ Must NOT**.

---

## 0. Reading this document

### 0.1 Living-document clause (critical)

This Visual SDD is **intentionally incomplete**. Its job is to fix the *visual language and editorial direction* — not to enumerate every page. **Absence of a page here does NOT mean it is out of scope.** The following are explicitly **in scope** and will be appended as later phases reach them, each built in the **same Samorah design language** established here:

> FAQ · Shipping & Exchanges · Search · Cart · Checkout · Account Dashboard · Blog/Journal · About · Contact · Archive · Admin Dashboard · Inventory · Orders · Customers · Analytics · Settings.

Treat V2 as **append-only and living**. New sections extend it; they never invalidate prior work. When a new page is introduced, it inherits the tokens (v1.0), the editorial principles (§0.3), and the surface rhythm — it does not invent a new look.

### 0.2 Deltas — where V2 overrides v1.0 / the prototype

| Topic | Prototype / v1.0 | **V2 (authoritative)** |
|---|---|---|
| Announcement bar | Scrolling marquee | **Static, centred, no marquee** — a single luxury signal (rotates by fade, optional) |
| Header at hero | Sticky ivory by default | **Transparent floating** over the hero (Trudon) → **ivory glass blur on scroll** |
| Mega menu | 4 columns *per* menu | **One 3-column full-screen menu**: category rail · dynamic sub-links · campaign visual; **× CLOSE**; very large type |
| Top-nav set | SHOP · CHAPTERS · ARCHIVE · ABOUT | **SHOP · CHAPTERS · COLLECTIONS · ARCHIVE · ABOUT** (COLLECTIONS = the Air/Hours lines) |
| Hero | 50/50 split | **60/40 split**, text overlaps image, smoke + shadow atmosphere; image side may be a 2-image slider |
| Product page | 5 blocks | **14-section editorial sequence** (adds Flame Persona, Lifestyle Use, Craft & Composition, Meet the Artist, Reviews; "Smells/Feels/Hour" block; sticky ATC) |
| Vessel sizes | 100g · 200g · 350g (seeded) | **Mockup shows 120g · 180g · 250g** → **OPEN DECISION** (§30) — catalogue currently seeds 100/200/350 |
| Collection pages | Single grid | **4 reusable layout templates (A/B/C/D)**, one per Volume; *View All* groups by Volume |
| Air / Room-Linen | Not built | **THE AIR CHAPTERS** — full Room + Linen "Hours" architecture + dedicated air product page |
| Reviews/testimonial | — | **Never stars/cards** — editorial quote only ("Verified Customer") |

### 0.3 The non-negotiable editorial laws (restated, from the PDF's own emphasis)

1. **No ecommerce feeling. No Shopify cards.** Galleries, not product tiles.
2. **No tiny nav links.** Navigation type is large and elegant.
3. **No random layouts forever.** Collections reuse 4 predefined templates (§19) — luxury scales by standardising, not by inventing endlessly.
4. **Hierarchy = luxury.** Not everything is an equal grid (Makers, Featured, Chapter pages are deliberately asymmetric).
5. **Restraint over persuasion.** No stars, no "SALE", no popups, no large shouty CTAs where a quiet text-link will do.
6. **Dior × Trudon feeling** — couture restraint + heritage gravitas + cinematic dark beats.

---

# PART A — GLOBAL CHROME

## 1. Announcement Bar

```
══════════════════════════════════════════════════════════════
            Crafted to transform atmosphere into ritual
══════════════════════════════════════════════════════════════
```

**▸ Layout & behaviour** — Thin bar, **centred** typography, micro-tracking uppercase or fine serif. One message at a time; if it rotates, it **fades** between lines — it does **not** scroll. Sits above the (transparent) header.
**✶ Emotional intent** — An ultra-minimal luxury signal, like the engraved line on a perfume box. Calm, declarative, confident.
**⊘ Must NOT** — No scrolling marquee. No promo codes, countdowns, or "% OFF". No more than one message visible. (Acceptable alt copy: *"Free shipping across India on all orders."*)

## 2. Header — transparent → ivory glass

```
   AT HERO (transparent, floating)            ON SCROLL (ivory glass)
──────────────────────────────────────     ──────────────────────────────────────
  ☰ MENU      SAMORAH      ⌕  ☺  ⛁           ☰ MENU     SAMORAH     SEARCH ACCOUNT CART
        (over the hero image)                 (soft ivory blur, hairline shadow)
```

**▸ Layout & behaviour** — Three zones: **☰ MENU** (left) · **SAMORAH** wordmark (centre) · **Search / Account / Cart** (right). **Transparent and floating** above the hero; on scroll past the hero it transitions to a **soft ivory glass** background (blur + faint hairline). Large horizontal spacing, thin type, **no heavy borders**. Used on Home and the Product page ("Floating Header").
**✶ Emotional intent** — Dior-style quiet luxury: minimal but expensive. The header should feel like it's *barely there* until you need it.
**⊘ Must NOT** — No solid bar at the top of the hero. No boxed buttons, no borders, no dense link clusters. Wordmark stays centred and unembellished.

## 3. Mega Menu — 3-column full-screen system

```
──────────────────────────────────────────────────────────────────  ✕ CLOSE
  CATEGORY RAIL        DYNAMIC SUB-LINKS              CAMPAIGN VISUAL
  (large type)         (changes on hover)            (changes on hover)
  ┌─────────────┐      ┌──────────────────┐          ┌────────────────────┐
   SHOP                 Candles                        [   editorial image  ]
   CHAPTERS             Candle Melts                    December's First Flame
   COLLECTIONS          Room & Linen Sprays             "Warm chai editorial"
   ARCHIVE              Ritual Bundles
   ABOUT                Best Sellers / New Arrivals
  └─────────────┘      └──────────────────┘          └────────────────────┘
```

**▸ Layout & behaviour** — **Column 1 (static):** the five categories as **very large** elegant type. **Column 2 (dynamic):** sub-links for the hovered/active category. **Column 3 (dynamic visual):** a campaign image that **swaps on hover** with a serif caption. A clear **✕ CLOSE**. Full-width, generous whitespace.
Category contents:
- **SHOP** → Candles · Room & Linen Sprays · Ritual Bundles · Best Sellers · New Arrivals
- **CHAPTERS** → Vol. I Dessert · Vol. II The Wild Within · Vol. III Mood Library · Vol. IV Nature Chapter
- **COLLECTIONS** → The Hours Collection · Volume I The Everyday · Volume II The Intimate *(coming soon)* · Discover The Collection
- **ARCHIVE** → Retired Fragrances · Past Editions · Collector Releases · Seasonal Archives
- **ABOUT** → Our Story · Craft & Ingredients · Meet The Makers · Contact

**✶ Emotional intent** — Walking into a gallery wing, not opening a dropdown. Dior × Trudon. The campaign image makes the menu feel *merchandised by an editor*.
**⊘ Must NOT** — No tiny nav links. No 4-column link soup. No more than one campaign image. Don't auto-close on the first mouse-out — it's a destination, with an explicit close.

---

# PART B — HOMEPAGE (cinematic downward flow)

> Section order is fixed: **Hero → Signature Chapters → Brand Story → Scent Experience → Air + Bundle → Featured Product → Testimonial → Atmosphere Grid → Newsletter → Footer.** Surface rhythm alternates light → dark per v1.0 §7.

## 4. Hero — 60/40 cinematic split

```
──────────────────────────────────────────────────────────────────
  TEXT (60%)                                  IMAGE (40%)
                                              ┌──────────────────────┐
  FRAGRANCE CRAFTED AS ATMOSPHERE             │  cinematic still      │
                                              │  soft floating        │
  Fragrance Crafted                           │  light / smoke        │
  As Atmosphere                               │  candle + shadows     │
                                              │  (may be 2-img slider)│
  Slow-crafted luxury candles inspired        │                       │
  by ritual, silence and timeless warmth.     │                       │
                                              │                       │
  [ Explore Collection ]                      └──────────────────────┘
──────────────────────────────────────────────────────────────────
            ↓ text gently overlaps the image edge
```

**▸ Layout & behaviour** — **60% text / 40% image.** Massive serif statement heading; small uppercase label above; one emotional sub-line; a single `[ Explore Collection ]` button. Text **overlaps** the image edge. Header is transparent over this. Image side carries **soft light/smoke and luxury shadows**, optionally a 2-image slow slider.
**✶ Emotional intent** — A Dior perfume-campaign film still. Tension between *text-heavy emotional storytelling* (left) and *pure cinematic visual* (right) = luxury.
**⊘ Must NOT** — No ecommerce hero (no "Shop Now" grid, no price, no carousel dots screaming). No flat full-bleed photo with centred text. Don't lose the smoke/shadow atmosphere.

## 5. Signature Chapters — editorial intro + gallery slider

```
              SAMORAH COLLECTIONS
              The Signature Chapters
   A fragrance library composed through atmosphere, ritual and memory.

  ┌────────────┐   ┌────────────┐   ┌────────────┐   →  (drag / snap)
  │  VOL I     │   │  VOL II    │   │  VOL III   │
  │ huge image │   │ huge image │   │ huge image │
  │  Dessert   │   │Wild Within │   │Mood Library│
  │  subtext   │   │  subtext   │   │  subtext   │
  └────────────┘   └────────────┘   └────────────┘
                 ─── ───── ───   (hairline dot nav)
```

**▸ Layout & behaviour** — A clean typographic intro **first** (no box, no background card — just whitespace), **then** an oversized, gallery-like horizontal slider of chapter cards. Soft beige ground, large image spacing, tiny uppercase labels, refined pricing, **hover zoom**. Multiple cards visible at once; drag + scroll-snap + hairline dots.
**✶ Emotional intent** — Browsing a fragrance *library* — horizontal, cinematic, atmosphere-first. Each card is a doorway into a world.
**⊘ Must NOT** — **NOT Shopify product cards.** No container card around the intro. No cramped 3-up grid of tiny tiles. No hard borders or drop shadows on cards.

## 6. Brand Story — immersive split

```
┌──────────────────────────┬──────────────────────────────────────┐
│                          │  CREATED FOR THE SPACES BETWEEN…      │
│  LARGE CINEMATIC IMAGE   │  Samorah is an exploration of         │
│                          │  fragrance as atmosphere — crafted    │
│                          │  slowly through memory, ritual and    │
│                          │  emotion…                             │
│                          │  [ Discover Our World ]               │
└──────────────────────────┴──────────────────────────────────────┘
```

**▸ Layout & behaviour** — Full-width split: **large cinematic image left**, long-form emotional copy right (small label → elegant heading → 1–2 paragraphs → text-link/button).
**✶ Emotional intent** — The brand's philosophy, told like an editorial feature. Slow, intimate, declarative.
**⊘ Must NOT** — No icon-trio "Our Values" row. No stock "About us" tone. Keep it one image + one column of prose.

## 7. Scent Experience — dark fragrance exhibition

```
══════════════════════════════════════════════════════════════ (deep charcoal)
                 THE FRAGRANCE EXPERIENCE
     Each composition unfolds slowly through atmosphere,
                 warmth and layered memory.

  Warm Spiced Gourmand                 Sweet Oriental
  Rich, creamy, delicately floral.     Spiced floral leather, smoky warmth.
   Opening  Bergamot · Green Tea …      Opening  Saffron · Pink Pepper
   Heart    Rose · Cardamom · Cinnamon  Heart    Rose · Leather · Clove
   Base     Sweet Milk · Vanilla …      Base     Amber · Vanilla · Cedarwood
   Inspired by …                        Inspired by …
══════════════════════════════════════════════════════════════
```

**▸ Layout & behaviour** — Dark charcoal section, warm-ivory type, subtle smoke texture, gold accents. A grid of **fragrance-family cards**, each = family name, one descriptor line, then the pyramid **Opening / Heart / Base**, then an *"Inspired by"* line.
**✶ Emotional intent** — A fragrance *exhibition wall* — olfactory identity and craftsmanship presented like museum labels. The drama beat of the page.
**⊘ Must NOT** — No bright UI here. No buy buttons. No more than the note hierarchy per card. Don't break the dark, hushed mood.

## 8. Air Chapter + Bundle — two clickable editorial blocks

```
┌───────────────────────────────┬───────────────────────────────┐
│  AIR CHAPTER                   │  THE RITUAL SET               │
│  Fragrance designed to drift   │  A curated ritual of warmth,  │
│  softly through atmosphere     │  flame and layered atmosphere.│
│  and memory.                   │                               │
│  Explore The Air Collection →  │  Discover The Bundle →        │
└───────────────────────────────┴───────────────────────────────┘
        (entire block clickable; image-backed, overlay text)
```

**▸ Layout & behaviour** — Two side-by-side editorial blocks. **Left = AIR CHAPTER** (atmospheric, light, airy). **Right = THE RITUAL SET / BUNDLE** (warmer, richer, gift-like). Small label, serif title (48–64px), and a **minimal text-link** CTA. **The whole block is clickable.**
**✶ Emotional intent** — Two doorways, two moods — air vs flame — presented as campaign banners.
**⊘ Must NOT** — **No large CTA buttons** (text-link only). No third block. Don't let it read as a promo banner with a discount.

## 9. Featured Product — asymmetrical spotlight

```
┌──────────────────────────────┬───────────────────────────────┐
│                              │  VOL. I — DESSERT             │
│  LARGE PRODUCT IMAGE         │  December's First Flame       │
│                              │  Blended with sweet milk,     │
│                              │  rose, cardamom and warm      │
│                              │  spices inspired by Kashmiri  │
│                              │  chai.                        │
│                              │  "More than a scent — warmth  │
│                              │   waiting to be lit."         │
│                              │  [ Shop Now ]                 │
└──────────────────────────────┴───────────────────────────────┘
```

**▸ Layout & behaviour** — Large **asymmetrical** composition: image left (weighted), narrative right — Volume/Chapter label, name, story copy, a poetic line, `[ Shop Now ]`.
**✶ Emotional intent** — One hero candle, given a full editorial spread. Intimacy and focus after the exhibition wall.
**⊘ Must NOT** — No spec table, no variant pickers here (that's the PDP). No symmetric 50/50 — keep the asymmetry.

## 10. Testimonial — editorial quote

```
                       WHAT PEOPLE FEEL

      "The fragrance lingered softly through the evening —
          warm, intimate and quietly nostalgic."

                     — Samorah Customer
```

**▸ Layout & behaviour** — Centred, large italic serif quote, small uppercase label above, quiet attribution below. Nothing else.
**✶ Emotional intent** — Emotional validation as poetry, not "social proof."
**⊘ Must NOT** — **No stars. No rating cards. No bright UI. No avatars or carousels.**

## 11. Atmosphere Grid — magazine mosaic

```
┌───────────────────────┬─────────────┐     SAMORAH ATMOSPHERE
│                       │  SMALL IMG  │     Inside The World Of Samorah
│      LARGE IMAGE      ├─────────────┤
│                       │  SMALL IMG  │   mix: candle closeups · interiors
├───────────────────────┴─────────────┤        textures · smoke · rituals
│   SMALL IMG    │     LARGE IMAGE    │        shadows
└────────────────┴────────────────────┘
```

**▸ Layout & behaviour** — Editorial image grid with **alternating sizes** (large/small rhythm), magazine feel. Small label + title above. Varied aspect ratios.
**✶ Emotional intent** — World-building — the lifestyle universe Samorah lives in.
**⊘ Must NOT** — No cramped equal-square Instagram gallery. No like-counts or handles. No uniform tiles.

## 12. Newsletter & 13. Footer

```
            RECEIVE MOMENTS, NOT PROMOTIONS
        [ Your Email Address ]      [ Subscribe ]
──────────────────────────────────────────────────────────────
       Fragrance Designed To Linger Beyond The Flame
   SHOP            CHAPTERS           ABOUT          (FOLLOW)
   Candles         Dessert            Our Story      Instagram
   Collections     Wild Within        Craft          Pinterest
   Bundles         Mood Library       Contact        Spotify
              © SAMORAH — ALL RIGHTS RESERVED
```

**▸ Layout & behaviour** — **Newsletter:** centred, headline *"Receive Moments, Not Promotions"*, inline email + Subscribe. **Footer:** dark; a serif statement tagline *"Fragrance Designed To Linger Beyond The Flame"*; quiet copyright. *(Wireframe above is illustrative — **canonical footer columns are fixed in §31**.)*
**✶ Emotional intent** — A quiet, dignified close — invitation, not capture. The footer reads like a colophon.
**⊘ Must NOT** — No "10% off your first order" bribe. No social-icon clutter. Keep the tagline poetic.

---

# PART C — PRODUCT PAGE (Candle)

## 14. The 14-section sequence

```
 1 Floating Header        8  Craft & Composition (Wax & Wick)
 2 Product Hero           9  Meet The Artist
 3 The Story Within      10  Candle Care + Safety
 4 Fragrance Journey     11  Shipping & Exchanges
 5 Scent Mood + Cultural 12  Reviews
 6 Flame Persona         13  You May Also Like
 7 Lifestyle Use Case    14  Footer
```

**▸ Layout & behaviour** — The PDP is a **long editorial scroll**, not a buy-box-and-tabs page. Narrative sections alternate light/dark surfaces; the buy action stays reachable (sticky on mobile). Sections 3–11 are storytelling; 12–13 are quiet social/discovery.
**✶ Emotional intent** — Reading a chapter about *one* candle — story, scent architecture, mood, maker, ritual.
**⊘ Must NOT** — Don't collapse everything into tabs. Don't front-load specs. Don't skip the narrative to "get to the buy button."

## 15. Product Hero (Trudon-inspired)

```
┌──────────────────────────┬──────────────────────────────────────┐
│                          │  VOL. I.1 · DESSERT CHAPTER           │
│  TALL EDITORIAL          │  CORE COLLECTION                      │
│  PRODUCT IMAGE           │  December's First Flame               │
│  (sticky)                │  A warm Kashmiri chai composition…    │
│                          │  Theme        Winter Rituals          │
│                          │  Scent Group  Warm Spiced Gourmand    │
│                          │  ₹2,400                               │
│                          │  Vessel:  ◻ Glass  ◻ Ceramic  ◻ Terra │
│                          │  Size:    120g  180g  250g            │
│                          │  [ Add To Cart ]                      │
└──────────────────────────┴──────────────────────────────────────┘
   VESSEL GRID →  Glass: Clean & luminous · Ceramic: Soft matte
                  warmth · Terracotta: Earthy crafted texture
```

**▸ Layout & behaviour** — Tall immersive image **left** (sticky). Right: Vol/Chapter + collection label, poetic tagline, **Theme**, **Scent Group**, **Price**, **Vessel selection** (image grid of 3 with descriptors), **Size selection**, **[ Add To Cart ]**. Buy logic uses v1.0 domain helpers (`defaultVariant`, `findVariant`, `stockStatus`, `formatPrice`/`gstBreakdown`, "inclusive of all taxes").
**✶ Emotional intent** — A perfume-counter moment — the object presented with reverence before any transaction language.
**⊘ Must NOT** — No thumbnail-strip-and-zoom catalog gallery vibe. No quantity steppers crowding the buy box. Don't show vessels as plain radio buttons — they are **image tiles** with descriptors.

## 16. Narrative stack (sections 3–7)

```
  THE STORY WITHIN     centred narrow prose — origin / memory
  FRAGRANCE JOURNEY    "The Fragrance Structure": Opening / Heart / Base
  SCENT MOOD + CULTURAL REFERENCE   Mood: Slow · Comforting · Intimate · Nostalgic
                                    Cultural: "Inspired by Kashmiri chai…"
  FLAME PERSONA        "The Quiet Storyteller" — soft-spoken, nostalgic, warm
  LIFESTYLE USE CASE   "Best Experienced" — quiet evenings, reading rituals…
  THE EXPERIENCE       Smells Like · Feels Like · The Hour
```

**▸ Layout & behaviour** — A sequence of slow, mostly centred/narrow editorial blocks. **Fragrance Journey** = the Opening/Heart/Base pyramid (from `groupNotes()`). **Scent Mood** pairs mood tags with a **Cultural Reference**. **Flame Persona** gives the candle a character. **Experience** uses the signature **Smells Like / Feels Like / The Hour** triad.
**✶ Emotional intent** — Build a *person* and a *moment* around the scent. This is where Samorah stops being a product and becomes a memory.
**⊘ Must NOT** — Don't merge these into one dense block. Don't turn mood tags into filter chips here (they're editorial + SEO, not interactive). Keep text short and spaced.

## 17. Craft & Composition → Meet the Artist

```
  CRAFT & COMPOSITION
  Hand-poured in small batches using our signature coconut-apricot
  wax blend… natural lead-free cotton wicks… layered to unfold slowly.

┌──────────────────────────┬──────────────────────────────────────┐
│  ARTIST PROCESS IMAGE    │  MEET THE ARTIST                      │
│                          │  Each illustration across Samorah is  │
│                          │  painted by hand with patience and    │
│                          │  emotional depth.                     │
└──────────────────────────┴──────────────────────────────────────┘
            [        FULL-WIDTH ARTWORK IMAGE        ]
```

**▸ Layout & behaviour** — **Craft & Composition** = centred craft prose (wax/wick/composition). **Meet the Artist** = process photo + editorial storytelling split, followed by a **full-width cinematic artwork** image.
**✶ Emotional intent** — Provenance and authorship — the human hands and the painted art behind the label.
**⊘ Must NOT** — No spec-sheet table for craft. Don't reduce the artist to a byline — give it image space.

## 18. Details Accordion → Reviews → You May Also Like

```
  PRODUCT DETAILS (accordion, slides softly, "+")
   Description            +
   Craft & Ingredients    +
   Candle Care            +
   Shipping & Exchanges   +

  REVIEWS — "What People Felt"
   "Warm, nostalgic and unexpectedly emotional…"  — Verified Customer

  YOU MAY ALSO LIKE  ·  "Continue Exploring"
   [ Vol I.2 Whispered Flame ]  [ Vol II.1 Forest Hymn ]  [ Vol III.1 Crimson Dusk ]
```

**▸ Layout & behaviour** — A soft accordion (Description · Craft & Ingredients · Candle Care · Shipping & Exchanges — mechanics per v1.0 §9.7, "+", slides gently). **Reviews** = editorial quote(s) under "What People Felt", attributed "Verified Customer". **You May Also Like** = up to 3 related cards ("Continue Exploring"), via `getRelatedProducts()`.
**✶ Emotional intent** — Quiet utility (details), quiet validation (reviews), quiet discovery (related) — the page exhales.
**⊘ Must NOT** — **No heavy accordion animation.** **No star ratings / review forms with stars.** Related rail shows at most 3, no "customers also bought" upsell tone.

---

# PART D — COLLECTION / CHAPTER ARCHITECTURE (scalable)

## 19. The four reusable editorial layout templates

```
 LAYOUT A — Feature Grid        LAYOUT B — Offset Grid
 ┌───────────────┐              ┌───────────────┐
 │ LARGE FEATURE │              │   PRODUCT     │
 └───────────────┘              └───────────────┘
 ┌──────┐ ┌──────┐                 ┌──────┐ ┌──────┐
 │ small│ │ small│                 │ prod │ │ prod │   (offset rhythm)
 └──────┘ └──────┘                 └──────┘ └──────┘
 best: 3 products, hero          best: artistic / mood
 storytelling  → Dessert         collections → Wild Within

 LAYOUT C — Symmetrical Grid     LAYOUT D — Cinematic Banner
 ┌──────┐ ┌──────┐               ┌───────────────────────┐
 │ prod │ │ prod │               │   WIDE BANNER IMAGE   │
 └──────┘ └──────┘               └───────────────────────┘
 ┌──────┐ ┌──────┐               ┌──────┐ ┌──────┐
 │ prod │ │ prod │               │ prod │ │ prod │
 └──────┘ └──────┘               └──────┘ └──────┘
 best: large / scalable archive  best: nature / seasonal / campaign
```

**▸ Layout & behaviour** — Every Volume/Chapter page is rendered with **one of four predefined templates**, chosen by its character — **not** a bespoke layout each time. Default assignment: **Vol I → A · Vol II → B · Vol III → C · Vol IV → D**; future volumes **reuse** (e.g. Vol V → C, Vol VI → A). A product/volume carries a `featured_layout_type`. **View All** groups **by Volume**, each Volume rendering its assigned template, producing a changing editorial rhythm down the page.
**✶ Emotional intent** — Curated variety that still feels like one house — the way Dior reuses editorial templates across seasons.
**⊘ Must NOT** — **Do not invent endless one-off layouts** (unmaintainable, messy). Don't group View All by product — group by Volume. Don't hardcode sections; render the template dynamically from the volume's data.

---

# PART E — THE AIR CHAPTERS (Room + Linen)

## 20. Air Chapters — collection page ("The Hours")

```
  FULLSCREEN HERO — THE HOURS COLLECTION / Volume I — The Everyday
  "The unnoticed moments that shape a day."          ↓ Scroll to Explore

  ROOM — Shared Hours
   ┌──────────────────────┬─────────────────────┐   HOUR 09:20 · Open Window
   │  IMAGE               │  Content            │   "Air after the first light."
   └──────────────────────┴─────────────────────┘
   ─── divider ───
   ┌─────────────────────┬──────────────────────┐   HOUR 18:40 · Slow Evening
   │  Content            │  IMAGE               │   (blocks ALTERNATE A/B)
   └─────────────────────┴──────────────────────┘

  LINEN — Private Hours   (same alternating "Hour" blocks)
  NEXT VOLUME TEASER — Volume II — The Intimate (Coming Soon)
  FOOTER
```

**▸ Layout & behaviour** — Umbrella **THE AIR CHAPTERS** (*"Fragrance without flame. Moments that live in the air, not in wax."*). Flow: **Fullscreen Hero → ROOM (Shared Hours) → alternating Hour blocks → Divider → LINEN (Private Hours) → alternating Hour blocks → Future Volume Teaser → Footer.** Each product is an **"Hour"** (e.g. *HOUR 09:20 — Open Window*) using a **2-layout alternate system**: A = Image Left / Content Right, B = Content Left / Image Right. 80–120px spacing between products; whole block clickable.
**✶ Emotional intent** — Time-of-day storytelling; fragrance as the texture of ordinary hours. Quieter and airier than the candle world.
**⊘ Must NOT** — Don't grid these like products. Don't drop the "Hour" framing. Only **two** reusable block layouts — no per-product invention.

## 21. Air product page (Room/Linen mist)

```
  EDITORIAL HERO        ┌─ IMAGE 60% ─┐  HOUR 09:20 · Open Window · ROOM
                        │             │  Air after the first light.
                        │             │  Paan · Tonka · Amber
                        └─────────────┘  ₹1,299   [ Add to Cart ]
  Smells like → Feels like → The Hour → Composition → Experience →
  Where it lives → Signature Line → [Details Accordion] → STICKY ADD TO CART
```

**▸ Layout & behaviour** — Visual split **60% editorial image / 40% text**. Story flow: **Smells like · Feels like · The Hour · Composition · Experience · Where it lives · Signature Line · Details accordion · Sticky Add to Cart.** Micro-animations: fade-in text on scroll, slight image zoom. Mobile stacks image → buy → narrative blocks (§26).
**✶ Emotional intent** — A short prose poem about a room at a specific hour. Intimacy over information.
**⊘ Must NOT** — Don't use the candle PDP's 14-section template here (air is its own, shorter flow). Keep text short per block. Image must feel editorial, not catalog.

---

# PART F — BUNDLE BUILDER

## 22. Build-Your-Own (Ritual Set)

```
──────────────────────────────────────────────────────────────────
        GLASS    |    CERAMIC    |    TERRACOTTA      (vessel tabs)
──────────────────────────────────────────────────────────────────
  LEFT (60%) — Product List        RIGHT (40%) — Your Composition
  [img] Name            Add        ┌ Visual Tray ──────────────┐
  [img] Name            Add        │  ▢   ▢   ▢   (0 / 3)       │
  [img] Name            Add        └───────────────────────────┘
                                    Item Name           Remove
                                    Item Name           Remove
                                    Total           ₹ ____
                                    [ Add Bundle ]
```

**▸ Layout & behaviour** — Header **vessel tabs** (Glass / Ceramic / Terracotta) filter the list. **Left 60%** = product list (image, name, **Add**). **Right 40%** = composition panel: a **visual tray** showing **0 / 2 / 3** filled slots, the chosen items with **Remove**, a running **Total** + savings, and **[ Add Bundle ]** (adds as one line). State lives in a `bundleStore`.
**✶ Emotional intent** — Composing a ritual, like arranging objects on a tray — tactile and considered.
**⊘ Must NOT** — Don't make it a multi-step wizard. Don't hide the running composition. Keep the tray visible and the math honest (show savings).

---

# PART G — EDITORIAL / BRAND PAGES

## 23. Our Story — 13-beat editorial flow

```
 1 Hero (immersive)              8  Narrow text — Made with Intention
 2 Centred — The Beginning       9  Full-width image
 3 Narrow — The Shift           10  Narrow — Where Scent Meets Sight
 4 Full-width image break       11  Narrow — Our Way
 5 Narrow — Fragrance: A Story  12  Centred — What We Believe
 6 Image break (overlay line)   13  Centred closing line
 7 Narrow — From Scent to Flame
```

**▸ Layout & behaviour** — A long-form scroll alternating **centred / narrow text** with **full-width image breaks** (some with an overlaid italic line). Narrow columns left- or right-aligned for rhythm.
**✶ Emotional intent** — A literary brand essay — the reader drifts through chapters of the founding story.
**⊘ Must NOT** — No timeline graphics, no "mission/vision" boxes. Don't centre everything — vary alignment for rhythm.

## 24. Meet the Makers — hierarchy is the design

```
  HERO — Meet the Makers ("A quiet note about the people behind Samorah")
  ┌───────────────┬───────────────┐   COFOUNDER  (Image Left / Text Right)
  ┌───────────────┬───────────────┐   ADVISORY   (Image Right / Text Left)
  ┌──────┐ ┌──────┐                    GRID — Artist card · Dog (Stress Buster) card
  FUTURE (expandable grid)
```

**▸ Layout & behaviour** — **Not an equal grid.** Hero → **large feature (Cofounder)** image-left/text-right → **large feature (Advisory)** image-right/text-left → a **small grid** for secondary people (Artist, and the dog "Stress Buster" — slightly larger, playful). Designed to expand later.
**✶ Emotional intent** — Warmth and personality; importance expressed through size and order, not uniformity. The dog is a deliberate human touch.
**⊘ Must NOT** — **Don't give everyone an equal card** — hierarchy = luxury. Don't make it a corporate "team" grid.

## 25. Craft & Ingredients — pyramid + ingredients

```
  HERO → CRAFT INTRO (centred)
  [Image] Candle Maker  →  ▔▔ full-width image break ▔▔
  Artist [Image]        →  ▔▔ full-width image break ▔▔
  [Image] Terracotta Maker → VESSELS → ▔▔ image break ▔▔
  INGREDIENTS:  Wax (narrow) → Fragrance (narrow) → Wick (narrow)
  CLOSING PHILOSOPHY LINE  →  Brand Signature
```

**▸ Layout & behaviour** — Hero → centred craft intro → **alternating maker/image "pyramid"** blocks separated by **full-width atmospheric image breaks** → Vessels → **Ingredients** (Wax / Fragrance / Wick as narrow columns) → large centred **Closing Philosophy** line → minimal **Brand Signature**.
**✶ Emotional intent** — Reverence for materials and makers; the craft told cinematically, ingredient by ingredient.
**⊘ Must NOT** — No bullet "features" list for ingredients. Don't skip the image breaks — they pace the page.

---

# PART H — MOBILE

## 26. Mobile behaviour

```
  HEADER → ☰ opens FULLSCREEN nav (large serif items, ✕ CLOSE)
  HERO → image first, then text stacked (60/40 becomes vertical)
  PRODUCT (candle/air) stack:
     [ IMAGE ] → HOUR/label → name → notes → price → [ Add to Cart ]
     ↓ Smells like / Feels like ↓ The Hour ↓ Composition ↓ Experience
     ↓ Where it lives ↓ Signature      (Sticky Add to Cart pinned bottom)
```

**▸ Layout & behaviour** — All splits collapse to single column (image generally first). Mega menu → **fullscreen** mobile nav with **large serif** items and a clear close. PDP/air-PDP stack image → buy → narrative; **Add to Cart becomes sticky** at the bottom. Touch targets ≥44px; sliders are swipe-native. Honour `prefers-reduced-motion` (v1.0 §8.4).
**✶ Emotional intent** — The editorial calm survives on a phone — generous spacing, one idea per screen, the buy action always within reach.
**⊘ Must NOT** — Don't shrink the desktop mega menu into a tiny dropdown. Don't bury Add to Cart. Don't crowd two columns onto small screens.

---

# PART I — LIVING REGISTER & RECONCILIATION

## 27. Not-yet-specified pages (in scope, to be appended)

These are **deliberately** not yet drawn. They remain in scope and will be appended in their build phases, in this design language:
**Storefront:** FAQ · Shipping & Exchanges · Search (overlay exists in v1.0 §) · Cart drawer (v1.0 §) · Checkout · Account Dashboard · Blog/Journal · About · Contact · Archive.
**Admin (Phase 15):** Dashboard · Inventory · Orders · Customers · Analytics · Settings — these follow a **functional** Shadcn-based system (admin is utility, not editorial) while still using Samorah tokens.

## 28. Reconciliation with v1.0 (system) — what each doc owns

- **V2 (this doc)** owns: page architecture, section order, layout templates, emotional intent, what-not-to-do, the Dior×Trudon editorial direction. **Authoritative for visuals.**
- **v1.0 (`SDD.md`)** owns: colour tokens, type families + scale, spacing scale, container widths, **motion curves** (`ease-luxury`/`ease-out`), **Framer-now / GSAP-later**, `prefers-reduced-motion`, and component micro-specs (button padding/states, input borders, tag taxonomy, accordion mechanics, badge). Still valid except where §0.2 overrides it.

## 29. Motion (unchanged from v1.0, applied to V2)

Framer Motion now; GSAP deferred. Reveals = fade + 24px rise on `ease-out`; hovers/zooms on `ease-luxury`; air-product micro-animations = fade-in-on-scroll + slight image zoom; accordion slides **softly** (no heavy animation). All honour reduced-motion.

## 30. Open decisions (need ratification)

1. **Vessel size taxonomy.** ⏸ **DECIDED (Phase 5.5 close): keep 100g / 200g / 350g for now** — not blocking. Mockups show 120/180/250g; if adopted later it's a catalogue reseed (variants/SKUs/prices), revisited as a content task, not a layout change.
2. **Vessel descriptors** — ⏸ **DEFERRED: future catalogue content.** Adopt *Glass: Clean & luminous · Ceramic: Soft matte warmth · Terracotta: Earthy crafted texture* when product/variant copy is authored. Not blocking.
3. **COLLECTIONS vs CHAPTERS routing** — ⏸ **DEFERRED to Phase 6.** CHAPTERS (Vol I–IV candle worlds) and COLLECTIONS (The Hours / Air lines) are distinct nav branches; routes finalised in Layout Chrome.
4. **Footer columns** — ✅ **RESOLVED (Phase 5.5A) → see §31.** Canonical: **SHOP · CHAPTERS · ABOUT · HELP · FOLLOW** (5 columns).

---

# ADDENDA (append-only)

## 31. Footer — canonical structure (resolves §30.4)

> Ratified Phase 5.5A. **Supersedes** the illustrative footer wireframe in §12 and **resolves** open decision §30.4. **Documentation only — footer implementation belongs to Phase 6 (Layout Chrome).** Five columns + tagline + copyright, on the deep-charcoal footer surface (v1.0 tokens, §9/§13).

```
──────────────────────────────────────────────────────────────────────
            Fragrance Designed To Linger Beyond The Flame
  SHOP            CHAPTERS              ABOUT            HELP                FOLLOW
  All Products    Vol. I – Dessert      Our Story        Shipping Policy     Instagram
  Scented         Chapter               Craft &          Returns &           Pinterest
   Candles        Vol. II – The Wild    Ingredients       Exchanges          Spotify
  Room & Linen     Within               Meet the Makers  Terms & Conditions
   Sprays         Vol. III – Mood       Journal          Privacy Policy
  Ritual Bundles   Library              Product Care     Contact Us
  New Arrivals    Vol. IV – Nature      .                FAQ
                   Chapter
                  © SAMORAH — ALL RIGHTS RESERVED
──────────────────────────────────────────────────────────────────────
```

**SHOP** — All Products · Scented Candles · Room & Linen Sprays · Ritual Bundles · New Arrivals
**CHAPTERS** — Vol. I – Dessert Chapter · Vol. II – The Wild Within · Vol. III – Mood Library · Vol. IV – Nature Chapter
**ABOUT** — Our Story · Craft & Ingredients · Meet the Makers · Journal · Product Care
**HELP** — Shipping Policy · Returns & Exchanges · Terms & Conditions · Privacy Policy · Contact Us · FAQ
**FOLLOW** — Instagram · Pinterest · Spotify

**Rationale (the decisions, recorded):**
- **Chapters get a dedicated column.** They are core to Samorah's identity, not a sub-item of Shop.
- **Product Care lives under ABOUT**, not Help — it's brand/craft narrative, not support.
- **HELP is reserved for support + legal** only (policies, contact, FAQ).
- **FOLLOW stays minimal and editorial** — three platforms, no icons-soup.
- **✶ Emotional intent / ⊘ Must NOT** from §12 still apply: colophon tone, no discount bribe, no social clutter, poetic tagline.

## 32. Inheritance contract for future pages

Any page introduced **after** Phase 5.5A — storefront or admin — **must inherit** the established system and **must not** introduce a separate visual identity:

- **Typography system** (Cormorant Garamond / DM Sans, the v1.0 §4 scale)
- **Editorial spacing rhythm** (v1.0 §5 — 120/80/160 section cadence, responsive step-downs)
- **Surface alternation** (ivory ↔ warm-ivory/soft-beige ↔ deep-charcoal, v1.0 §7 / V2 part B)
- **Motion language** (Framer now / GSAP later, `ease-luxury` + `ease-out`, reduced-motion — v1.0 §8)
- **Container widths** (1280 / 720 / 1440, gutters 48→32→20 — v1.0 §6)
- **Samorah colour tokens** (v1.0 §3 — gold `#C9A96E`, ivory `#FAF7F2`, etc.)

**Scope rule:** **storefront pages remain editorial**; **admin pages remain functional** (Shadcn-based utility) — but admin still uses Samorah tokens, never a foreign theme. **No future page invents its own look.**

The Visual SDD is **append-only and living**: new page specs are added below as development reaches them; nothing above is rewritten.

---

*End of Visual SDD V2 (Phase 5.5A). On approval, proceed to **Phase 5.6 — SPD**. This document is **living**: later phases append new page specs without altering what's above. No UI is built until V2 and SPD are both approved.*
