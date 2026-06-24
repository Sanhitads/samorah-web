# Samorah Design Document (SDD)

> **Status:** v1.0 · Phase 5.5 · *Design language reference — to be approved before any storefront UI.*
> **Source of truth:** the locked Vite/React prototype in [`legacy/`](../legacy) (design tokens in `legacy/index.css`, components + pages in `legacy/`). This document **codifies** that prototype into the canonical visual language for the Next.js build. It does not redesign it.
> **Companion:** [SPD](./SPD.md) (Samorah Photography Direction) — owns imagery; this owns everything else.

## 0. How to use this document

The storefront (Phases 6–10) is built **against** this document. When a page is built, every value — colour, type size, spacing, motion curve — is traceable to a token or rule here. If a screen needs something this document doesn't define, the SDD is extended **first**, then the screen is built. This is what keeps seven editorial pages feeling like one house and not seven themes.

Two non-negotiables that this whole document serves:

1. **Editorial, not ecommerce.** Samorah is a *fragrance library* presented as chapters and volumes. Pages read like a magazine spread, not a storefront grid. Restraint is the default; the product is the hero, the chrome disappears.
2. **Preserve the identity.** The prototype already *is* Samorah. Every signature below is retained verbatim. Inspiration brands calibrate taste; they never override what already exists.

---

## 1. Brand DNA

### 1.1 Positioning

**Samorah** — *luxury handmade scented candles, composed in India.* The product is not "a candle"; it is **a chapter in a fragrance library** — "layered, intentional, deeply felt." The brand voice is literary, sensory, and unhurried. Catalogue architecture is the brand: **Volumes** (Vol. I–IV) and **Chapters** (Dessert, The Wild Within, Mood Library, Nature), each a curated mood.

The two-line brand promise, verbatim from the prototype, is the tonal tuning fork:

> *"Every flame holds a story. **Find yours.**"*
> *"Handcrafted in India. Composed with intention."*

### 1.2 Identity signatures — never remove

These are the load-bearing elements of Samorah's look. They are **preserved**, not reinterpreted:

| Signature | What it is | Where it lives |
|---|---|---|
| **Chapters & Volumes** | Literary catalogue structure (Vol. I–IV) | Mega menu, collection cards, product chapter labels |
| **The gold** | A single warm accent, `#C9A96E`, used sparingly | Micro-labels on dark, dividers, cart badge, selection, scroll indicators |
| **Italic serif "whisper"** | Cormorant Garamond *italic* for taglines & poetic lines | Every tagline, poetic line, testimonial, sub-heading |
| **Uppercase micro-label "structure"** | DM Sans, 9–10px, wide tracking, uppercase | Section eyebrows, chapter labels, note labels |
| **Light ↔ dark surface cadence** | Ivory and charcoal sections alternate down a page | Homepage rhythm, product page |
| **Fragrance pyramid** | Top / Heart / Base presented as a journey | Product page, scent cards |
| **Quiet motion** | Slow scale, letter-spacing widening, scroll reveals on `ease-luxury` | Everywhere; nothing is fast or bouncy |
| **Near-sharp corners** | `border-radius` of **1–2px**, never pill-rounded cards | All cards, inputs, tags |

### 1.3 Inspiration calibration

Four houses calibrate taste. Each contributes a *discipline*; none replaces Samorah's identity.

- **Cire Trudon** — *gravitas & the candle as objet.* Heritage seriousness, dramatic dark grounds, literary naming. → Validates Samorah's Volume/Chapter framing and the dark "Fragrance Journey" sections.
- **Dior Maison** — *couture restraint & structured grids.* Generous symmetry, gold used as a thread not a flood, refined editorial grids. → Disciplines our gold (accent only) and our asymmetric splits.
- **Diptyque** — *scent as narrative.* Note storytelling, the fragrance pyramid, typographic confidence. → Anchors the pyramid display and sensory copy.
- **Aesop** — *radical restraint & text-forward luxe.* Muted palette, generous margins, no hard sell, sensory utilitarian voice. → Sets our negative-space budget and "never shout" rule.

### 1.4 What we explicitly reject (anti-patterns)

To stay editorial, Samorah does **not** use: star-rating clutter, screaming "SALE!" starbursts, dense tiny-card grids, autoplay upsell carousels of unrelated product, popups/interstitials, heavy drop-shadows, glossy/skeuomorphic buttons, fully-rounded "card soup," or more than one accent colour. Discounts are stated quietly (struck price + small percent), never as a banner.

---

## 2. Design principles (the rules)

1. **One accent.** Gold appears in small, intentional doses. If gold is doing more than ~5% of a screen, it's wrong.
2. **Type does the work.** Hierarchy comes from serif/sans contrast, size, and tracking — not from boxes, shadows, or colour.
3. **Whitespace is luxury.** Sections breathe at 120px; never crowd to fit more product.
4. **Image-led, full-bleed.** Imagery runs to the edge or fills a grid half. Cards are images first, words second.
5. **Restraint in motion.** Everything eases slowly (`ease-luxury`). No bounce, no spin, no parallax gimmicks (until GSAP, §8.6).
6. **Sharp, not soft.** 1–2px radius. Borders are 1px hairlines, usually `--beige` or a low-opacity white on dark.
7. **Dark earns drama.** Charcoal surfaces are reserved for moments that deserve weight (scent experience, fragrance journey, footer).
8. **Accessible by construction.** Min 4.5:1 text contrast, visible focus, honoured `prefers-reduced-motion`, ≥44px touch targets.

---

## 3. Colour system

### 3.1 Canonical palette (from `legacy/index.css` `:root` — adopted verbatim)

| Token | Hex | Role |
|---|---|---|
| `--ivory` | `#FAF7F2` | **Primary background.** The brand's default canvas. |
| `--warm-ivory` | `#F5F0E8` | Secondary surface — hero text side, featured product, light page heroes |
| `--soft-beige` | `#F0EBE3` | Tertiary surface — brand story, newsletter, scent-mood blocks |
| `--beige` | `#E8DDD0` | **Hairline borders**, inactive states, slider dots |
| `--deep-beige` | `#D4C8B8` | Placeholder text, faint marks |
| `--charcoal` | `#2A2A2A` | Hover-dark, secondary dark fills |
| `--deep-charcoal` | `#1A1A1A` | **Primary text** & primary dark surfaces (footer, scent experience) |
| `--smoke` | `#6B6B6B` | Body copy on light, secondary text |
| `--muted` | `#9A8A7A` | Micro-labels, eyebrows, meta — a warm taupe |
| `--gold` | `#C9A96E` | **The accent.** Labels on dark, dividers, selection, badges |
| `--gold-light` | `#D4B483` | Accent hover/lift |
| `--gold-dark` | `#A8843C` | Accent on light where contrast is needed (e.g. savings text) |
| `--white` | `#FFFFFF` | Pure white — rare; product photography backdrops |

**Low-opacity ivory on dark** (a recurring system, not ad-hoc): text on charcoal uses `rgba(250,247,242, α)` with α ∈ {0.75 body, 0.6 sub, 0.5 muted, 0.4 faint, 0.3 footer-fine}. White hairlines on dark use `rgba(255,255,255, 0.06–0.12)`.

### 3.2 Surface semantics

Four surfaces, used as an intentional sequence (see §7):

- **Ivory** (`--ivory`) — default, most sections.
- **Warm ivory / soft beige** — "a half-step warmer," used to separate adjacent light sections without a hard line.
- **Deep charcoal** — drama. Text becomes ivory; gold becomes the only accent that survives; radial gold glows allowed (`scent-experience::before`).

### 3.3 The gold reconciliation (decision)

The BRD §design proposed `--accent #9C826B` / `--bg-primary #F5F2ED`. **Resolution: the prototype wins.** Samorah's accent is **`#C9A96E`** and primary background **`#FAF7F2`**. Rationale: the gold is used pervasively and deliberately across the established identity (announcement bar, scent labels, dividers, selection highlight, cart badge), and `#9C826B` reads as a muted taupe that collapses against `--muted #9A8A7A`. The BRD taupe is **retired**, not adopted. *(If a more antique accent is ever wanted, `--gold-dark #A8843C` already covers that need on light surfaces.)*

### 3.4 Gradient placeholders → photography

Until the SPD's real photography lands, imagery is represented by **named CSS gradients** (`.grad-chai`, `.grad-amethyst`, … 22 defined in `legacy/index.css`). These are **dev fallbacks**, encoded in the catalogue as `gradient:<class>` (see `product_images.url`). The domain helper `isGradientPlaceholder()` already distinguishes them. The SPD owns their replacement; the SDD only guarantees every image slot has a graceful gradient until then. Gradient hues intentionally echo each scent (chai = amber/brown, amethyst = violet/black) and should inform the photography mood per product.

---

## 4. Typography

### 4.1 Families

- **Serif — Cormorant Garamond** (`--font-serif`): display, headings, product names, prices, and every *italic* tagline. The voice of the brand. Loaded via `next/font` → `--font-cormorant`.
- **Sans — DM Sans** (`--font-sans`): body, UI, micro-labels, buttons. The structure.

Base body: **15px / line-height 1.7 / weight 300**, colour `--deep-charcoal` on `--ivory`. Headings: serif, **weight 400**, line-height **1.15**, letter-spacing **−0.01em**.

### 4.2 Type scale (fluid, from real usage)

Display sizes are fluid via `clamp(min, vw, max)` — exact values from the prototype:

| Role | Size | Weight | Notes |
|---|---|---|---|
| Page hero title | `clamp(40px, 6vw, 88px)` | 300 | lh 1.05, ls −0.02em |
| Home hero heading | `clamp(52px, 5.5vw, 84px)` | 300 | lh 1.08, ls −0.02em; `<em>` italic |
| Footer statement | `clamp(32px, 4vw, 64px)` | 300 | serif |
| Section H2 (chapters) | `clamp(36px, 4vw, 60px)` | 400 | |
| Section H2 (scent / featured / newsletter) | `clamp(28–32px, 3–3.5vw, 52–56px)` | 400 | |
| Product detail name | `clamp(32px, 3vw, 52px)` | 400 | |
| Testimonial quote | `clamp(22px, 3vw, 40px)` | 300 *italic* | lh 1.45 |
| Card / scent / chapter name | 28px (chapter, scent) · 22px (product card) | 400 | serif |
| Logo wordmark | 26px | 500 | ls 0.18em, uppercase |
| Price | 26px (detail) · 22px (featured) · 17px (card) | 400 | serif |
| Tagline (italic) | 18px (detail/featured) · 13px (card) | 400 *italic* | serif, colour `--smoke` |
| Body | 15px | 300 | lh 1.7–1.9 |
| Body small / meta | 13–14px | 300 | colour `--smoke` |
| **Micro-label** | **10px** | **500** | **ls 0.2em, uppercase, `--muted`** |
| Eyebrow on dark | 9–10px | 500 | ls 0.2–0.3em, uppercase, `--gold` |

### 4.3 Rules

- **Italic serif = the whisper.** Reserved for taglines, poetic lines, sub-headings, testimonials. Never set UI labels in italic.
- **Uppercase + tracking = the structure.** Micro-labels and buttons are uppercase DM Sans with 0.12–0.3em tracking. Tracking *widens* with importance/eyebrow elevation.
- **Negative tracking on display.** Large serif headings use −0.01 to −0.02em to stay tight and editorial.
- **`<em>` is a colour/italic shift, not bold.** Headings emphasise via italic (and on hero, a hairline colour shift `--charcoal`), never weight.

---

## 5. Spacing system

### 5.1 Base & section rhythm

Spacing is an **8px-ish editorial scale** (4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 64, 80, 120, 160). Vertical section rhythm is the brand's pulse:

| Class | Desktop | ≤1024px | ≤768px |
|---|---|---|---|
| `.section` | **120px** block | 80px | 60px |
| `.section-sm` | 80px | 60px | 48px |
| `.section-lg` | 160px | 100px | 72px |

Default section padding is `padding-block: 120px`. Sections step down responsively in lockstep (above). This single rule carries most of the "luxury breathing room."

### 5.2 Common gaps

- Editorial split columns: **80px** gap (48–64px when tighter).
- Product grid: **48px row / 32px column**.
- Card internals: 12–32px.
- Inline label→value: 16px.
- Micro stacks (note pills, tags): 8px.

---

## 6. Containers & grid

### 6.1 Containers

| Token | Width | Use |
|---|---|---|
| `--container` | **1280px** | Default content width |
| `--container-narrow` | 720px | Long-form reading (story, policy body) |
| `--container-wide` | 1440px | Mega menu, full-bleed-with-margin |

**Inline padding** (the page gutter), responsive: **48px → 32px (≤1024) → 20px (≤768)**. Containers are `margin-inline: auto`. Header height is a fixed **72px** (`--header-height`).

### 6.2 Grid patterns (the editorial vocabulary)

- **Symmetric split** `1fr 1fr` — hero, brand story, makers, air bundle.
- **Asymmetric split** `1.1–1.2fr / 0.8–0.9fr` — featured product, product detail (gallery-weighted), chapter featured.
- **Product grid** `repeat(3, 1fr)` → `repeat(2,1fr)` ≤1024 → 2-col tight ≤600.
- **Editorial image grid** — atmosphere grid: 3 columns with per-item aspect ratios (4/5, 1/1, 4/3) and a `span 2` tall cell for rhythm.
- **Mega menu** `1.5fr 1fr 1fr 1.2fr` (links-heavy first, campaign image last).
- **Full-bleed** — dark sections and image entries run edge-to-edge; inner content respects the container.

Most splits collapse to single-column at ≤1024px; the image typically takes `order: -1` (image first) on stacked mobile heroes.

---

## 7. Editorial rhythm

The homepage (and every long page) is composed as a **score of alternating surfaces and densities** — this *is* the luxury, more than any single component.

The cadence: **light → texture → light-warm → DARK → image-duo → light-warm → quiet centred → image-grid → light-warm → DARK footer.** Concretely on the homepage:

1. Hero (warm-ivory + image) — *open bright.*
2. Signature Chapters (ivory, horizontal motion) — *browse.*
3. Brand Story (soft-beige split) — *settle.*
4. **Scent Experience (deep-charcoal)** — *the drama beat.*
5. Air Chapter + Bundle (image duo) — *atmosphere.*
6. Featured Product (warm-ivory) — *focus on one.*
7. Testimonial (ivory, centred) — *breathe / human voice.*
8. Atmosphere Grid (ivory, image mosaic) — *world-building.*
9. Newsletter (soft-beige, centred) — *quiet invitation.*
10. **Footer (deep-charcoal)** — *close with weight.*

Rules of rhythm: never place two dark sections adjacent; never run three identical-density light sections in a row without a texture or image break; every dark beat is *earned* by the content's emotional weight; the page **opens light and closes dark**.

---

## 8. Motion language

Motion is **slow, eased, and quiet.** Initial implementation is **CSS transitions + Framer Motion**; **GSAP is deferred** (§8.6).

### 8.1 Curves & durations

- `--ease-luxury` = `cubic-bezier(0.25, 0.1, 0.25, 1)` — the house curve (hovers, menus, drawers, scale).
- `--ease-out` = `cubic-bezier(0, 0, 0.2, 1)` — scroll reveals, entrances.
- Durations: micro 0.2–0.3s · standard 0.35–0.4s · reveal 0.8s · hero zoom 8s (cinematic).

### 8.2 Motion catalogue (from the prototype)

| Motion | Spec |
|---|---|
| **Scroll reveal** | opacity 0→1 + translateY 24px→0, 0.8s `ease-out`; stagger delays 0.1 / 0.2 / 0.35s |
| **Image hover scale** | `scale(1.02–1.04)`, 0.6–0.8s `ease-luxury` (card 1.04, chapter 1.02, featured 1.03) |
| **Hero slow zoom** | `scale(1.02)` over **8s** on hover/idle |
| **Button hover** | background shift **+ letter-spacing widens** 0.15em→0.2em (the signature) |
| **Text link / nav hover** | opacity → 0.6 (+ nav underline / 4px padding nudge) |
| **Mega menu** | opacity + visibility + translateY −8px→0, 0.35s `ease-luxury` |
| **Mobile nav** | translateX 100%→0, 0.4s `ease-luxury` |
| **Search overlay** | backdrop fade 0.25s + panel slide-down 0.3s |
| **Cart drawer** | overlay fade 0.2s + drawer translateX 32px→0 0.3s; **badge pop** scale 0.5→1 0.25s |
| **Accordion** | max-height 0→300px + "+" icon rotate 45°, 0.4s `ease-luxury` |
| **Announcement marquee** | translateX 0→−50%, 20s linear infinite |
| **Scroll indicator** | vertical line scaleY pulse, 2s infinite |

### 8.3 Framer Motion mapping

- **Reveals** → a shared `<Reveal>` wrapper using `whileInView` + `viewport={{ once: true }}`, variants `{ hidden: {opacity:0, y:24}, show: {opacity:1, y:0} }`, transition `{ duration: 0.8, ease: [0,0,0.2,1] }`. Replaces the prototype's `ScrollReveal` + IntersectionObserver.
- **Staggers** → parent `staggerChildren: 0.1` instead of `.reveal-delay-*`.
- **Hovers / drawers / menus** → may stay CSS (cheaper, already correct) **or** Framer `whileHover` / `AnimatePresence`. Overlays (cart, search, mobile nav) use `AnimatePresence` for clean enter/exit.
- **Marquee** → CSS keyframes (no need for JS).

### 8.4 `prefers-reduced-motion`

When set: disable scale-on-hover, the 8s zoom, the marquee, and replace reveal translate with a plain opacity fade (or no animation). Framer reveals read the reduced-motion hook and skip `y`. This is a build requirement, not optional.

### 8.5 Performance

Animate **only** `transform` and `opacity`. No animating layout properties. Reveals fire once. Sliders use native scroll-snap, not JS per-frame.

### 8.6 GSAP — deferred

GSAP is **not** used in the storefront foundation. Candidate future uses (pinned scroll storytelling, advanced draggable inertia for the chapter slider, timeline-sequenced hero) are revisited **after** Phases 6–10 ship. Until then: native scroll-snap for sliders, Framer for everything else. Do not introduce GSAP without an explicit phase.

---

## 9. Components

> All components below are specced from `legacy/index.css`. Net-new admin/forms may use Shadcn (per the build plan), but **storefront** components follow these specs exactly.

### 9.1 Buttons

| Variant | Surface | Spec |
|---|---|---|
| `.btn` (base) | — | DM Sans 11px, weight 500, **ls 0.15em, uppercase**, padding 14px 32px, gap 8px, `transition: all 0.35s ease-luxury`, **no radius** |
| `.btn-dark` | light | `--deep-charcoal` bg / `--ivory` text; hover → `--charcoal` + **ls 0.2em** |
| `.btn-outline` | light | transparent + 1px `--deep-charcoal` border; hover → fills dark, text ivory |
| `.btn-ghost` | **dark/image** | transparent + `rgba(255,255,255,0.4)` border, ivory text; hover → `rgba(255,255,255,0.1)` |
| `.text-link` | light | 11px uppercase ls 0.15em, 1px bottom border, hover opacity 0.6; `.text-link-light` for dark surfaces |
| `.atc-btn` | light | **full-width**, padding 18px, 11px ls 0.18em — the product buy button |

Primary CTA = `btn-dark` on light, `btn-ghost` on imagery/dark. The **letter-spacing widening** on hover is the signature interaction — keep it.

### 9.2 Inputs

- **Standard field** (`.form-input`, `.form-textarea`): 1px `--beige` border, transparent bg, padding 14px 16px, 14px DM Sans, **focus → border `--deep-charcoal`** (no glow, no shadow). Textarea min-height 140px, vertical resize. Label above: micro-label style (10px, ls 0.18em, uppercase, `--muted`), 8px gap.
- **Inline newsletter** (`.newsletter__form`): a single 1px `--deep-charcoal` bordered row; flush input + dark submit button; collapses to stacked at ≤768px.
- **Search input** (`.search-overlay__input`): serif **22px**, italic placeholder in `--deep-beige`, borderless within its row.
- States to define for Phase 6 forms (extend here): error = `--gold-dark` or a red kept off-brand-minimal; disabled = `--muted` text + `not-allowed`. Focus is always the charcoal hairline.

### 9.3 Tags & pills (the taxonomy)

Samorah has **four** distinct tag treatments — use the right one:

| Tag | Context | Spec |
|---|---|---|
| **Micro-bordered tag** | scent-group, mood tags, search-result tags | 9–10px, ls 0.15–0.2em, uppercase, 1px `--beige` border, padding ~5px 12–14px, `--charcoal`/`--muted` |
| **Note pill (dark)** | scent-card note pills on charcoal | 11px, `rgba(250,247,242,0.65)`, 1px `rgba(255,255,255,0.12)` border, padding 4px 12px, 1px radius |
| **Variant option** | size/vessel selectors | 12px, 1px `--beige` border, padding 9px 18px; **selected/hover → dark fill, ivory text** |
| **Search chip** | search suggestions | 12px, 1px `--beige` border, padding 7px 16px; hover → dark fill |
| **Product badge** | "Featured" etc. on card image | **`--gold` bg, ivory text**, 9px ls 0.2em uppercase, padding 4px 10px, top-left overlay |

The badge is the **only** place gold becomes a filled background — reserve it. Badge text is derived by `productBadge()` (sold-out / sale / hero / bestseller / low-stock).

### 9.4 Cards (general philosophy)

All Samorah cards are **image-first, near-sharp (1–2px radius), border-light**. Two archetypes:

- **Overlay card** (chapter, collection, chapter-support): full image, gradient scrim bottom-up (`linear-gradient(to top, rgba(0,0,0,0.5–0.65), transparent 60–65%)`), text in ivory at the bottom, hover scales the image 1.02–1.03 and (for collections) deepens the scrim.
- **Caption card** (product card): image block on top, text beneath on the page surface, hover scales image 1.04 and fades the name to 0.7 opacity.

No drop shadows. No filled card backgrounds (except dark scent cards which sit on the section's charcoal). Hover is always a slow scale + a quiet opacity shift, never a lift or shadow.

### 9.5 Product card — anatomy

Spec from `legacy/components/ProductCard.jsx` + `.product-card`:

```
[ image  aspect 3/4, overflow hidden ]
   └ optional badge (top-left, gold)         ← productBadge()
   └ img hover: scale(1.04), 0.7s ease-luxury
[ chapter label ]   10px ls 0.18em uppercase --muted     ← collection.volume + name
[ name ]            serif 22px --deep-charcoal; hover opacity 0.7
[ tagline ]         serif italic 13px --smoke
[ notes ]           11px --muted: top2 + heart1 joined " · "
[ price ]           serif 17px --charcoal                 ← formatPrice()
```

Whole card links to `/shop/[slug]` (route reconciled in Phase 6; prototype used `/product/:slug`). Metadata order is fixed: **chapter → name → tagline → notes → price.** Notes are derived (`fragranceNotes.top.slice(0,2) + heart.slice(0,1)`), now sourced from `fragrance_notes` via `groupNotes()`.

### 9.6 Collection (chapter) card — anatomy

Two presentations of the same chapter data:

**Homepage slider card** (`.chapter-card`, `legacy/components/SignatureChapters.jsx`):
```
flex 0 0 380px (300px mobile), image height 520px (420 mobile), radius 2px
[ image + bottom scrim ]  hover scale(1.02), 0.6s
[ info, bottom, ivory text ]
  ├ volume    9px ls 0.25em uppercase, opacity 0.7      "Vol. I"
  ├ name      serif 28px                                "Dessert Chapter"
  ├ tagline   serif italic 12px, opacity 0.75           "Where memory tastes like warmth."
  └ link "Discover" → /collections/[slug]  + arrow      (or "Coming Soon" state)
```
Slider: horizontal scroll-snap, drag-to-scroll (grab cursor), hairline **dot nav** (`.slider-dot`, active = 40px wide charcoal bar). Coming-soon → `--coming` 0.6 opacity + "Coming Soon" appended under the name, no link.

**Collections page entry** (`.collection-entry`): min-height 500px full-bleed, scrim deepens on hover, bg scales 1.03; same volume/name/tagline + "Discover Collection" `text-link-light`. Coming-soon → non-interactive (`pointer-events:none`) with a "Coming Soon" label. `liveCollections()` / `comingSoonCollections()` drive ordering.

### 9.7 Supporting components

- **Micro-label** (`.micro-label`): the universal eyebrow — 10px ls 0.2em uppercase `--muted` (gold on dark).
- **Divider** (`.divider`): 40px × 1px gold rule; `--center` variant; `.gold-dot` 4px inline separator.
- **Accordion**: 1px `--beige` separators, header 13px DM Sans, "+" icon rotates 45° → "×" when open, body animates max-height 0→300px. Used on product page.
- **Slider dots, scroll indicator, cart badge, breadcrumb** — all specced in `legacy/index.css`; reuse verbatim.

---

## 10. Page blueprints

> Blueprints define **structure, order, surface, and copy** — not pixels (pixels are in §3–9). Routes are reconciled in Phase 6; prototype paths shown for traceability.

### 10.1 Homepage structure

Chrome: **Announcement bar** (dark marquee, 4 rotating messages) → **Header** (sticky ivory; `--scrolled` adds blur + hairline after 40px). Then the 9 sections (full rhythm in §7):

| # | Section | Surface | Content |
|---|---|---|---|
| 1 | **Hero** | warm-ivory split | label *"Samorah — A Fragrance Story"*; heading *"Light a flame. **Begin a story.**"*; paragraph; CTA `Explore Collections` → /collections; image side; scroll indicator |
| 2 | **Signature Chapters** | ivory | eyebrow *"Samorah Collections"*; H2 *"The Signature Chapters"*; sub; draggable chapter-card slider + dots |
| 3 | **Brand Story** | soft-beige split | image + label, heading, two paragraphs, CTA |
| 4 | **Scent Experience** | **deep-charcoal** | eyebrow (gold); H2; italic sub; 2×2 scent cards (family, name, italic tagline, top/heart/base **note pills**, "inspired by") |
| 5 | **Air Chapter + Bundle** | image duo | two overlay blocks (label, serif title, italic sub, CTA) |
| 6 | **Featured Product** | warm-ivory split `1.2/0.8` | image 4/5; label, name, italic tagline, story, note rows, price, CTA |
| 7 | **Testimonial** | ivory centred | serif quotation mark; large italic quote; uppercase source |
| 8 | **Atmosphere Grid** | ivory | eyebrow + H2; 3-col editorial image mosaic with varied aspect ratios |
| 9 | **Newsletter** | soft-beige centred | label, heading, italic sub, inline form, fine-print note |
| — | **Footer** | **deep-charcoal** | statement *"Every flame holds a story. Find yours."*; 5-col nav (Brand blurb + Shop / Chapters / About / Help); social; copyright |

### 10.2 Product page structure

From `legacy/pages/ProductDetail.jsx`. Order, top → bottom:

1. **Breadcrumb** — `Home · {chapter} · {name}`, 12px `--muted`, hairline bottom.
2. **Main split** `1.1fr / 0.9fr`, 80px gap:
   - **Gallery (sticky, left):** main image 3/4 + 4 thumbnails (active full-opacity). *(Phase 9 wires real images; gradient fallback today.)*
   - **Info (right):** chapter label (gold) → **name** (H1) → italic tagline → scent-group **tag** → **price** (serif 26px) → **Vessel** selector (`variant-option`s) → **Size** selector → **`Add to Cart`** (full-width; "✓ Added" 2s feedback) → **quick details** 4 rows (Burn Time / Wax / Wick / Theme) → **accordion ×4**: *The Story Within · Candle Care + Safety · Shipping & Exchanges · Ingredients & Materials.*
3. **Fragrance Journey** (`section-sm`, **deep-charcoal**): eyebrow *"Fragrance Pyramid"* → heading *"Fragrance Journey"* → italic sub → **3 columns** Top / Heart / Base notes (serif, from `groupNotes()`).
4. **Scent Mood** (soft-beige, 2-col): left — eyebrow *"Scent Mood"*, **flame persona** heading, **mood tags**, lifestyle-use line; right — eyebrow *"Cultural Reference"*, serif reference paragraph.
5. **Related** (*"You May Also Like" / "More From This Chapter"*): `product-grid` of up to 3 from the same chapter, via `getRelatedProducts()`.

Buy-box logic uses the domain layer: `defaultVariant()` preselects, `findVariant()` resolves the chosen vessel×size, `stockStatus()` gates the button, `formatPrice()`/`gstBreakdown()` render price + "inclusive of all taxes."

### 10.3 Collection & chapter pages (blueprint)

- **Collections index** (`/collections`): dark page-hero (*"The Signature Chapters"*) → 2-col grid of `.collection-entry` cards (staggered reveal), coming-soon non-interactive.
- **Chapter listing** (`/collections/[slug]`): full-bleed **chapter hero** (volume eyebrow gold, large serif name, italic poetic line, ghost CTA) → **featured candle** split (image + name, tagline, story, note rows, price, `Shop {name}`) → **"Supporting Fragrances"** `chapter-support-grid` (overlay cards). Coming-soon chapters render a centred hero + poetic line + "Coming Soon," no products.

### 10.4 Mega menu structure

Trigger: hover/focus on a top-nav item opens a full-width panel (`--container-wide`, grid `1.5fr 1fr 1fr 1.2fr`, 48px padding, slide-down 0.35s). Every menu ends in a **campaign slot** (4/5 gradient image, label + italic sub + "Featured" micro-label). Top nav order: **SHOP · CHAPTERS · ARCHIVE · ABOUT.**

| Menu | Columns |
|---|---|
| **SHOP** | *Products:* Candles, Candle Melts, Room & Linen Sprays, Ritual Bundles, Best Sellers, New Arrivals · **campaign:** "December's First Flame" |
| **CHAPTERS** | *Fragrance Chapters:* Vol. I Dessert · II The Wild Within · III Mood Library · IV Nature · *Collections:* The Hours, Vol. I The Everyday, Vol. II The Intimate · **campaign:** "Dessert Chapter" |
| **ARCHIVE** | *The Archive:* Retired Fragrances, Past Editions, Collector Releases, Seasonal Archives · **campaign:** "The Samorah Archive" |
| **ABOUT** | *About Samorah:* Our Story, Craft & Ingredients, Meet The Makers, Contact · **campaign:** "Made With Intention" |

Column links are serif 14px with a hover opacity + 4px left-nudge. **Route reconciliation (Phase 6):** preserve this IA; links to not-yet-built categories (Melts, Room Sprays) either route to a coming-soon state or are hidden until those catalogue types exist — decided in Phase 6, not here.

---

## 11. Mobile behaviour

### 11.1 Breakpoints

| Width | Behaviour |
|---|---|
| **≤1440px** | `--container-wide` ceiling |
| **≤1024px** (tablet) | Desktop nav → **hamburger**; logo left-aligns; most splits → 1 column (image `order:-1`); gutter 32px; sections step to 80px; product grid → 2-col; footer → 2-col |
| **≤768px** (mobile) | Gutter 20px; sections → 60px; hero/featured padding tightens; newsletter form stacks; mega-menu replaced by mobile nav |
| **≤600px** | Product grid stays 2-col but tight (gap 20/12) |
| **≤480px** | Cart drawer goes full-width |

### 11.2 Mobile navigation

- **Hamburger** (3 hairline bars) animates to an **×** on open.
- **Mobile nav** is a full-screen ivory panel, `translateX(100%→0)` 0.4s `ease-luxury`, scrollable, 80px top padding. Items are serif **28px** with `--beige` separators; sub-links 14px `--smoke` indented. Close "×" top-right.
- Cart, search, account remain reachable from the header bar on mobile.

### 11.3 Touch & interaction

- Targets ≥44px; selectors and buttons already exceed this.
- The chapter slider is **swipe-native** (scroll-snap) on touch — no drag-JS dependency; dots remain tappable.
- Sticky elements (product gallery) go **static** on ≤1024px so the page scrolls naturally.
- Hover-only affordances (image scale, letter-spacing) degrade gracefully — nothing essential is hover-gated.

---

## 12. Token implementation (bridge to Phase 6)

So Phase 6 builds against a single contract:

- **CSS custom properties** remain the source of truth (already ported into `src/app/globals.css` from `legacy/index.css`). The `:root` token block in §3.1 / §4 / §5 / §6 / §8.1 is canonical.
- **Tailwind v4 `@theme`** maps those variables to utilities (`--color-ivory`, `--color-gold`, `--font-serif`, container widths, the two eases as `--ease-luxury`/`--ease-out`) so net-new UI can use tokens without hard-coded hex.
- **Fonts**: `next/font` (Cormorant Garamond → `--font-cormorant` → `--font-serif`; DM Sans → `--font-sans`). Already wired in `layout.tsx`.
- **Component classes**: the storefront keeps the prototype's semantic classes (`.btn-dark`, `.product-card`, `.chapter-card`, …) — they are already correct and documented here. Tailwind utilities are additive for new layout, not a rewrite of these.
- **Reveal/motion**: a shared `<Reveal>` (Framer) replaces `ScrollReveal`; `AnimatePresence` for overlays. CSS keyframes (marquee, badge pop, scroll line) stay.

No code is written in this phase — this section only fixes the contract so Phases 6–10 are mechanical.

---

## 13. Open items & SPD handoff

1. **Photography** — every gradient placeholder (`gradient:<class>`) awaits the **SPD** (Phase 5.6): aspect ratios (1:1, 3:4, 4:5, hero crops), mood per scent (gradient hues are the cue), Cloudinary presets. **Blocks visual QA, not layout.**
2. **Mega-menu route reconciliation** — Melts / Room Sprays / Archive IA exists in design; their *routes* are a Phase 6 decision (coming-soon vs hidden).
3. **Size taxonomy** — catalogue seeded with 100g / 200g / 350g (prototype). If the BRD's 100/140/180g is ever adopted, it's a catalogue/content change, not an SDD change.
4. **Form state palette** — error/success colours for Phase 11 checkout forms to be appended to §9.2 when checkout is designed (kept minimal, off the gold).

---

*End of SDD v1.0. On approval, proceed to **Phase 5.6 — Samorah Photography Direction (SPD)**. No storefront UI is built until both are approved.*
