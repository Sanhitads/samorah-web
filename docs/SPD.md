# Samorah Photography Direction (SPD)

> **Status:** v1.0 · Phase 5.6 · *Primary **image** source of truth — establishes the photography language and image system before any UI is built.*
> **Companions:** [`SDD.md`](./SDD.md) (system: tokens, type, motion) · [`SDD-VISUAL.md`](./SDD-VISUAL.md) (visual/editorial layout — **primary visual SoT**). The SPD owns everything that fills an image slot; the SDDs own everything around it.
> **Bridge to what exists:** the catalogue currently stores **gradient placeholders** as `gradient:<class>` (e.g. `gradient:grad-chai`), distinguished at runtime by `isGradientPlaceholder()` / `gradientClass()`. The SPD defines how real photography replaces them — and how each gradient **becomes that image's blur placeholder**, so the brand's colour continuity survives the swap.

This document is **append-only and living** (same clause as the Visual SDD §0.1): new image specs are added as later phases need them; nothing above is rewritten.

---

## 0. Purpose & the one rule

Photography is where Samorah stops being layout and becomes *atmosphere*. Every image must read as **editorial, warm, slow, and intentional** — a fragrance campaign still, never a catalogue cutout.

**The one rule:** *if an image looks like stock or a Shopify product shot, it is wrong.* When in doubt, choose restraint, warmth, and negative space.

---

## 1. Editorial mood

The mood is **warm, cinematic, tactile, unhurried** — objects and spaces that feel *lived in and composed*. Calibrated against four houses (consistent with SDD §1.3):

- **Cire Trudon** → low-key, candlelit drama; the candle as *objet* on a quiet ground.
- **Dior Maison** → refined styling, generous negative space, gold as a thread.
- **Diptyque** → ingredient-led still-life; texture closeups; narrative props.
- **Aesop** → natural light, architectural calm, sensory restraint.

**Cultural lens (India-made, never kitsch):** props and scenes carry quiet Indian resonance matched to each chapter — chai steam and brass for Dessert, terracotta and marigold warmth for Nature, dusk and amethyst shadow for Mood Library — styled with luxury restraint. Suggest origin; never costume it.

**Per-chapter mood map** (the gradient hue is the cue):

| Chapter / scent | Gradient | Mood & palette |
|---|---|---|
| Dessert (chai, modak, gajar) | amber/brown | warm kitchen light, steam, brass, soft morning |
| The Wild Within | green/earth | rain-washed greens, woods, overcast calm |
| Mood Library (amethyst, crimson) | violet / deep red | dusk, low candlelight, velvet shadow, intimate |
| Nature Chapter | green/earth | botanical, daylight, raw texture |
| Gemstone (blush, citrine) | pink / gold | luminous, jewel warmth, soft glow |
| Air Chapters (Room/Linen) | blue-grey | cool, airy, white linen, open window light |

---

## 2. Hero photography

The homepage and product heroes are the brand's loudest whisper.

- **Composition:** a single subject (candle / vessel) with **soft floating light and smoke**, deep luxury shadows, and breathing room for the overlapping headline (SDD-VISUAL §4 — the image occupies ~40% on the right; text overlaps its edge).
- **Treatment:** cinematic, low-to-mid key, warm. A visible flame or its glow is encouraged. The image may be a **2-frame slow slider** (SDD-VISUAL §4) — both frames same mood/exposure.
- **Product hero (PDP):** tall, Trudon-style immersive portrait, sticky on desktop (SDD-VISUAL §15) — the vessel presented with reverence on a quiet ground.

**✶ Intent:** a perfume-campaign film still. **⊘ Never:** bright flat product-on-white, busy backgrounds, centred-text-over-full-bleed clichés, or anything that competes with the headline.

---

## 3. Lighting

- **Default:** soft, **directional natural window light** — a single warm key with a gentle fill; long, soft shadows (Aesop / Diptyque).
- **Hero & dark sections:** **low-key chiaroscuro, candlelit** — warm key, deep falloff, visible flame glow (Trudon). The Scent Experience and Fragrance Journey sit on charcoal, so imagery there must hold detail in shadow.
- **Lifestyle:** ambient daylight, time-of-day honest (morning for Air "Hours", dusk for Mood Library).

**⊘ Never:** on-camera flash, flat ring-light, cold overhead office light, or blown highlights. Keep a gentle shadow under every object — nothing floats.

---

## 4. Texture

Texture is the tactile proof of "handmade." Favour and capture: **wax surface and pour lines, matte ceramic glaze, raw terracotta grain, linen weave, paper, brass/gold, stone, wood, steam and smoke.** Atmosphere imagery (§10) leans into macro texture.

**⊘ Never:** plasticky sheen, over-retouched "perfect" surfaces, or HDR crunch. The flaw of the handmade is the luxury — keep it.

---

## 5. Colour temperature

Samorah's white balance runs **warm by default** (≈3000–3500K feel). Grounds are **ivory/warm-ivory, never pure cold white** (matches tokens `--ivory #FAF7F2` / `--warm-ivory #F5F0E8`). Gold accents read as warm metal, not yellow.

Temperature **shifts per chapter** (use the gradient as the target cast): warm-amber for Dessert/Gourmand; jewel-warm for Gemstone; **cooler** for Amethyst (violet dusk) and the Air Chapters (blue-grey, linen-cool). Within a product's image set, temperature stays **consistent** so the gallery doesn't flicker.

**⊘ Never:** cold/blue casts on warm chapters, mixed white balance within one set, or oversaturated "vivid" profiles.

---

## 6. Aspect ratios

Canonical ratios, tied to the SDD layouts (so Cloudinary crops are deterministic):

| Slot | Ratio | Used by (SDD) |
|---|---|---|
| **Product card** | **3:4** | product grid, related, search |
| **Product detail — main** | 3:4 | PDP gallery; thumbnails **1:1** |
| **Featured / mega-menu campaign** | **4:5** | featured product, mega-menu visual |
| **Chapter / collection card** | ~3:4 (tall) | signature chapters, collection entries, chapter support |
| **Hero (desktop)** | tall **4:5 → 3:4** portrait | home hero image side, PDP hero |
| **Brand-story / split image** | ~4:3 landscape | brand story, makers, craft, air "Hour" blocks |
| **Atmosphere grid** | mixed **4:5 · 1:1 · 4:3** | atmosphere mosaic (varied rhythm) |
| **Vessel tile** | ~1:1 | vessel selector, bundle list thumb |
| **Cart / search thumb** | 1:1 | drawers, search results |
| **OG / social** | 1.91:1 | metadata (Phase 16) |

Encode each as a Cloudinary `ar_` in the named transform (§12). Source masters are shot/stored **larger than the largest crop** so every ratio is a down-crop, never an upscale.

---

## 7. Crop rules

- **Gravity:** product/vessel shots use centred or `g_auto` with the subject framed; lifestyle/atmosphere use `g_auto`. Verify auto-crops on the tall ratios.
- **Safe areas:** keep **headroom above the flame**; never crop the **vessel rim or base**; never cut the **wax pool**. Leave breathing room — Samorah crops loose, not tight.
- **Hero:** preserve space on the headline-overlap side; subject weighted toward the outer edge.
- **No upscaling** (`c_fill` down only). **No awkward face/hand crops** in lifestyle (keep gestures whole).
- **Art direction over auto-crop** where it matters (hero, featured): provide a deliberately composed master per ratio rather than trusting one auto-crop for all.

---

## 8. Ceramic (and vessel-system) imagery

Three vessels are a **matched set** (SDD-VISUAL §15 descriptors): **Glass — clean & luminous**, **Ceramic — soft matte warmth**, **Terracotta — earthy crafted texture**.

- **Consistency is the spec:** identical angle, scale, distance, lighting, and ground across all three, so the vessel selector reads as one family. Only the material changes.
- **Ceramic specifically:** show the **matte glaze and subtle hand-thrown irregularity** — soft key light grazing the surface to reveal texture; warm shadow.
- **Terracotta:** raw grain, earthy warmth, slightly cooler shadow.
- **Glass:** luminosity and the wax/flame visible through it; controlled reflections (no studio-strip glare).
- Vessel tiles are ~1:1; **rim and base always in frame**.

**⊘ Never:** mismatched lighting between vessels, heavy reflections on glass, or a vessel cropped at the rim.

---

## 9. Lifestyle imagery

Candles and mists **in lived, elevated spaces** — reading corners, windowsills, evening tables, fresh linen — with honest natural light and quiet, culturally-resonant props. Hands and rituals welcome (lighting, pouring chai, folding linen) shot gesturally, not posed.

**✶ Intent:** aspirational warmth you could step into. **⊘ Never:** stocky "lifestyle model smiling at candle," cluttered staging, fake bokeh, or props that read as costume. One clear subject; generous space.

---

## 10. Atmospheric imagery

The abstract, sensory layer for the **Atmosphere grid** and dark sections — **smoke, flame, wax, light, texture, shadow**, often macro and product-optional. Moody, tactile, painterly.

- Mixed ratios (§6) drive the magazine rhythm of the grid (large/small alternation).
- These also seed the **Scent Experience / Fragrance Journey** dark backdrops (must hold detail in shadow).

**⊘ Never:** literal "scented" gimmicks, uniform square tiles, or like-count/Instagram-chrome framing.

---

## 11. Mobile image behaviour

- **Art-directed crops:** the desktop hero (tall portrait, headline beside it) re-crops to a **tighter portrait** with the subject lower/centred so the stacked headline (SDD-VISUAL §26) has room. Implement via two Cloudinary transforms selected by viewport (`<picture>`/`next/image` art-direction), not one stretched crop.
- **Payload discipline:** serve mobile-sized widths only; cap DPR at **2**; below-the-fold images **lazy-load**; only the LCP hero is eager (§13).
- **Ratios may shift** per slot on mobile (e.g. brand-story image goes from 4:3 to a shorter landscape) — keep the subject's safe areas (§7).

**⊘ Never:** ship a desktop-wide crop to phones, or load full galleries eagerly on mobile.

---

## 12. Cloudinary organisation & naming

**Single cloud, structured folders** (kebab-case, content-typed):

```
samorah/
  products/<product-slug>/
      <slug>-primary.jpg        # the card / PDP hero (3:4 master)
      <slug>-02.jpg … -0N.jpg   # additional gallery frames
      <slug>-detail.jpg         # macro / texture
      vessels/<vessel>-<size>.jpg   # e.g. ceramic-200g.jpg (1:1 master)
  collections/<collection-slug>/
      cover.jpg                 # collection entry (tall)
      hero.jpg                  # chapter listing hero
      editorial-01.jpg …
  lifestyle/<scene-slug>.jpg
  atmosphere/<texture-slug>.jpg
  brand/<our-story|makers|craft>/<slug>.jpg
  editorial/<campaign-slug>.jpg # mega-menu + home campaign slots
  og/<route>.jpg                # social cards (Phase 16)
```

**Naming:** lowercase kebab-case, two-digit index where sequenced, role suffix (`-primary`, `-detail`, `-hero`, `-cover`). Product folders key off the product **slug** (matches DB `products.slug`); vessel files off `<vessel>-<size>` (matches variant attributes).

**Delivery — named transformations** (defined once in Cloudinary, referenced as `t_…`; never hand-roll per call):

| Preset | Transform | For |
|---|---|---|
| `t_card` | `f_auto,q_auto,c_fill,ar_3:4,w_640` | product cards |
| `t_hero` | `f_auto,q_auto:good,c_fill,ar_4:5,w_1600` | heroes (LCP) |
| `t_featured` | `f_auto,q_auto,c_fill,ar_4:5,w_1200` | featured / campaign |
| `t_chapter` | `f_auto,q_auto,c_fill,ar_3:4,w_760` | chapter/collection cards |
| `t_vessel` | `f_auto,q_auto,c_fill,ar_1:1,w_400` | vessel tiles |
| `t_thumb` | `f_auto,q_auto,c_fill,ar_1:1,w_160` | cart/search thumbs |
| `t_atmosphere` | `f_auto,q_auto,c_fill,w_900` | atmosphere grid (ratio per slot) |
| `t_blur` | `f_auto,q_auto:low,e_blur:800,w_24` | placeholder source (§15) |

All presets force **`f_auto`** (AVIF/WebP negotiation) and **`q_auto`**. Wire `res.cloudinary.com` into `next.config` `images.remotePatterns`, with a thin `lib/cloudinary.ts` URL builder used by a custom `next/image` loader.

---

## 13. LCP hero image strategy

The homepage hero image is the **LCP element** — treat it as a budget-governed, prioritised asset:

- `next/image` with **`priority`** (emits `fetchpriority="high"` + preload); **never lazy**, never inside a deferred/animated wrapper that delays paint.
- Exactly **one** priority image per route (the hero). Everything else lazy.
- Serve the precise rendered size via `t_hero` (`q_auto:good`, `f_auto`); target the served crop **≲200 KB**.
- Pair with a **blur placeholder** (§15) for instant first paint while the hero streams.
- Reserve space with width/height or aspect-ratio box to keep **CLS ≈ 0**.
- Don't gate the hero behind a Framer entrance that gives it `opacity:0` at load — reveal hero *content* without hiding the LCP pixels (respects SDD §8.4 reduced-motion too).

---

## 14. Responsive image strategy

- **`next/image` everywhere** for storefront imagery; custom Cloudinary loader builds the srcset from the named presets + width.
- **Per-component `sizes`** (so the browser fetches the right width):

| Component | `sizes` |
|---|---|
| Hero | `100vw` (desktop ~40vw image column, but art-directed master) |
| Product card / grid | `(max-width:600px) 50vw, (max-width:1024px) 50vw, 33vw` |
| Featured / campaign | `(max-width:1024px) 100vw, 40vw` |
| Chapter card | `(max-width:768px) 300px, 380px` |
| Atmosphere item | `(max-width:768px) 50vw, 33vw` |
| Vessel / thumb | fixed (`400px` / `160px`) |

- **Formats:** AVIF → WebP → JPEG via `f_auto`. **DPR:** responsive, capped at 2.
- **Lazy by default**, eager only for the LCP hero.
- Define the Cloudinary width steps once (e.g. 160/320/400/640/760/900/1200/1600) and let the loader pick.

---

## 15. Blur placeholders

Two-tier, leveraging the existing gradient system:

1. **Catalogue images (products, chapters, vessels):** use the product's **brand gradient as the blur placeholder** — `placeholder="blur"` with a `blurDataURL` derived from `gradient:<class>` (the same hue already seeded, surfaced via `gradientClass()`). Encode the linear-gradient as a tiny inline SVG/data-URI. **Zero extra fetch, perfect brand continuity** — the photo dissolves out of its own colour.
2. **Lifestyle / atmosphere (no gradient):** a **Cloudinary `t_blur`** thumbnail (24px, blurred) as `blurDataURL`.

This makes the gradient placeholders we already store the *graceful first paint* under every photo — the swap from "gradient era" to "photo era" is seamless. Until a real photo exists for a slot, the gradient simply renders as the image itself (current behaviour, unchanged).

**⊘ Never:** a grey box, a spinner, or a layout shift while images load.

---

## 16. Alt-text conventions

Descriptive, human, ≤~125 chars, **no "image of/photo of"**:

- **Product (card/PDP):** `"{Product name} — {scent group} handmade scented candle by Samorah"` (extends the seed's existing pattern; add `in a {vessel} vessel` on the PDP gallery where vessel-specific). e.g. *"Kashmiri Chai — warm spiced gourmand handmade scented candle by Samorah."*
- **Vessel tile:** `"{Vessel} vessel — {descriptor}"` e.g. *"Ceramic vessel — soft matte warmth."*
- **Chapter / collection cover:** `"{Volume} — {Chapter name}"` e.g. *"Vol. I — Dessert Chapter."*
- **Lifestyle / atmosphere:** describe the **scene and mood**, not keywords. e.g. *"A lit candle on a windowsill in soft morning light."*
- **Purely decorative / gradient-only:** **`alt=""`** (empty) so screen readers skip it.

Alt text is stored on `product_images.alt_text` (already seeded) and authored per image; lifestyle/atmosphere alt lives with the component. Keep it accessible first, SEO second — never stuff.

---

## 17. Shot list, migration & handoff

**Migration (gradient → photo):** photos drop into the Cloudinary folders (§12); the catalogue `product_images.url` moves from `gradient:<class>` to the Cloudinary public ID; the gradient persists as the blur placeholder (§15). No code change needed for the swap — `isGradientPlaceholder()` simply stops matching once a real URL is set.

**Minimum shot list to unblock the storefront build** (Phases 6–10 can build against gradients; **real photos gate launch QA, Phase 17**):

- Per product (7 live): 1 primary (3:4), 1–2 gallery, 1 detail/macro.
- Vessel set: glass / ceramic / terracotta as a matched 1:1 trio.
- Per chapter (Vol I–III live): 1 cover (tall) + 1 hero.
- Home: 1–2 hero frames, 1 featured (4:5), 1 brand-story image.
- Atmosphere: 6–8 mixed-ratio texture/mood frames.
- Editorial/campaign: 4 mega-menu visuals (one per category).

**QA gate (pre-launch):** every image is `f_auto`/`q_auto`, correctly cropped on all ratios, warm-balanced, has a blur placeholder, has alt text (or `alt=""`), and the hero passes LCP/CLS budgets. No gradient placeholders remain in production catalogue rows.

---

## Coverage

All 17 requested topics: **1** Editorial mood · **2** Hero photography · **3** Lighting · **4** Texture · **5** Colour temperature · **6** Aspect ratios · **7** Crop rules · **8** Ceramic vessel imagery · **9** Lifestyle imagery · **10** Atmospheric imagery · **11** Mobile image behaviour · **12** Cloudinary organisation & naming · **13** LCP hero strategy · **14** Responsive image strategy · **15** Blur placeholders · **16** Alt-text conventions · (+ **17** shot list / migration / QA gate).

---

# ADDENDA (append-only)

## 18. Photography hierarchy (shoot & quality priority)

Tiers for production effort, budget, and quality — highest investment first. Guides later photoshoots:

| Tier | Subject | Quality bar |
|---|---|---|
| **Tier 1** | **Hero images** (home + PDP heroes) | **Highest** — the LCP/campaign moments; most direction, best light, art-directed crops |
| **Tier 2** | **Product images** (cards, PDP gallery, vessels) | High — consistent set, matched lighting across vessels |
| **Tier 3** | **Atmosphere** (texture, smoke, flame, dark-section backdrops) | High craft, lower volume — macro/mood frames |
| **Tier 4** | **Lifestyle** (interiors, rituals, hands) | Editorial but flexible — natural light, scene-led |
| **Tier 5** | **Admin / Blog** (utility, journal thumbs) | Functional — clean, on-brand, lowest production overhead |

Spend the budget top-down: a flawless hero matters more than volume in lower tiers. Lower tiers may launch with fewer frames and expand later.

## 19. Future — Editorial Video & Motion (Phase 16+)

> **Not now — a placeholder for later.** No video work in the storefront build (Phases 6–10).

A future **Editorial Video Direction** section will cover **5–8 second seamless loops**: candle **flame loops**, **steam** motion, **smoke**, and **slow hands** (lighting, pouring, folding linen). Same mood/lighting/temperature laws as stills (§1–§5); muted, ambient, no hard cuts. Delivery (Cloudinary video, `f_auto`/`q_auto`, poster frame from the matching still, `prefers-reduced-motion` → static poster) is specified when the phase arrives.

---

*End of SPD v1.0 (Phase 5.6). On approval, **Phase 5.5 + 5.6 design documentation is complete** and Phase 6 (Layout Chrome) may begin. Living document — image and motion specs for later pages are appended as built. No UI is implemented until this SPD is approved.*
