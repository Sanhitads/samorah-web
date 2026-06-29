# SAMORAH — Page & Platform Architecture

> **Status:** v2 (architecture spec — precedes Phase 8 implementation).
> **Constitution:** `ARCHITECTURAL_PRINCIPLES.md` (read first — the non-negotiable rules).
> **Companion to:** `PROJECT_CONTEXT.md` (decisions/state), `SDD`/`SDD-VISUAL` (visual system), `SPD` (photography), `ROADMAP.md`.
> **Rule:** this is the north star. Each item is tagged **[P8]** (build in Phase 8 — load-bearing, hard to retrofit) or **[Future]** (modelled/designed-for now, machinery built in a later phase). We build the *structure* for everything; we build the *machinery* only where tagged [P8].

---

## 0. Why this exists

Samorah is an **editorial commerce platform**, not "a website with pages." It will host many experiences (candles, air, shop, journal, campaigns, gifting, and future product lines) across future sites and seasons. To reach Shopify/Woo-grade flexibility *without* their generic templates, it rests on three principles (the full set lives in `ARCHITECTURAL_PRINCIPLES.md`):

1. **Composition over hard-coding** — pages are composed from reusable **Sections** and **Blocks** from registries.
2. **Content separated from presentation** — copy/products/imagery/relationships live in data; sections render what they're handed. (The homepage already proves this — `BrandStory`, `EditorialWorld`, `TheLetters` are pure, prop-driven section components.)
3. **CMS-ready now, admin GUI later** — Phase 8 ships the typed, data-driven foundation so pages are reorderable/themeable/schedulable **through data today**; the visual editor is an Admin phase.

---

## 1. The hierarchy

```
Platform
 └─ Experience      (Candle Chapters · Air Chapters · Shop · Journal · Campaigns · Gift)
     └─ Journey     (a narrative arc of pages — Morning · Room · Linen · Weekend)   [Future level]
         └─ Page    (slug · template · SEO · palette · status · schedule · navigation)
             └─ Section (type + variant + envelope: theme · mood · spacing · animation · layout)
                 └─ Block   (Quote · Image · Product · Divider · HourEntry …)
                     └─ Atom    (ProductCard · AssetImage · PriceTag · TextLink …)
```

Cross-cutting platform domains (referenced by every level): **Design System** (§2) · **Theme Tokens & Mood** (§9) · **Taxonomy** (§10) · **Assets** (§11) · **Commerce** (§14) · **SEO** (§19) · **Personalization** (§20) · **Events** (§21).

| Level | Owns |
|---|---|
| **Platform** | design-system versions · global theme tokens · taxonomy · asset library · commerce · SEO/search · navigation graph · event bus |
| **Experience** | a default template · base route · `ExperienceType` · theme defaults |
| **Journey** *(optional)* | a narrative grouping of pages within an experience |
| **Page** | identity + metadata + an ordered `Section[]` |
| **Section** | a `type` + `variant` + envelope + content `settings` + child `Block[]` |
| **Block** | a unit inside a section (own type from the Block Registry) |
| **Atom** | the smallest pure-presentation primitive (no data fetching) |

---

## 2. Design System & versioning  **[P8: the object, value "v1"]**

So a future redesign never breaks existing content, the platform pins a **Design System version**, and pages can belong to one.

```ts
interface DesignSystem {
  version;            // "1.0.0" — the overall system
  tokenVersion;       // colour/spacing tokens
  componentVersion;   // section/block/atom components
  typographyVersion;  // type scale & fonts
}
```
The platform declares a **current** DS version; a `Page` may pin `designSystemVersion` (default = current). Five years on, "Samorah v2" is a new DS version — old pages keep rendering against v1, new pages opt into v2. (Real per-document **content version history** is *not* built here — `variant` + campaign overrides cover seasonal looks; version history belongs in the Admin CMS — see §18.)

---

## 3. Experiences  **[P8: types + Candle Chapters; Future: the rest]**

Every page **belongs to an Experience** — pages never float. An Experience is product-agnostic (`ExperienceType`), so future lines (incense · diffuser · paper · wardrobe · car · perfume · tea · objects · ceramics) slot in as data.

```ts
type ExperienceKind =
  | "candle-chapters" | "air-chapters" | "shop"
  | "journal" | "campaign" | "gift";          // last three [Future]

interface Experience {
  id; kind: ExperienceKind;
  title; baseRoute;            // "/chapters" · "/collections" · "/shop"
  defaultTemplate; themeToken;
  experienceType?: string;     // opaque medium label (never branched on)
  navigation; status; visibility;
}
```

---

## 4. Journeys  **[Future — modelled now, optional]**

A **Journey** is a narrative arc of pages inside an experience, giving marketing a storytelling level above Page. (Air Chapters → Journeys *Morning · Room · Linen · Weekend* → Pages *Open Window …*.)

```ts
interface Journey {
  id; experienceId; title; slug;
  editorialMood?; themeToken?; order;
  status; visibility;
  pageIds: string[];           // ordered
}
```
Pages carry an optional `journeyId` now (so nothing retrofits); full Journey-driven navigation is built when a journey actually needs it.

---

## 5. Pages — identity + metadata  **[P8]**

A Page is **metadata + an ordered list of Sections**; metadata is first-class so SEO/scheduling/navigation are never an afterthought.

```ts
interface Page {
  id; experienceId; journeyId?; slug;     // identity
  template;
  designSystemVersion?;                    // §2 (default = current)
  status: PageStatus;                      // §18 workflow
  visibility: boolean;
  publishAt?; startAt?; endAt?;            // schedule (fields [P8]; cron [Future])
  palette: ThemeToken; editorialMood?; campaignId?;
  taxonomy?: TaxonomyRef[];                // §10
  navigation: { parent?; children?; previous?; next?; related?; campaign?; chapter?; journey?; };
  seo: SeoMeta; breadcrumb: BreadcrumbItem[];   // §19
  sections: SectionInstance[];
  locale?; localizedFrom?;                 // i18n [Future]
}
```
**Navigation is resolved, not hardcoded** — `next` = "the next published page in this experience/journey by order," so new Volumes need no edits.

### 5a. Page Engine — the resolution pipeline  **[P8]**

`resolvePage(page, opts?, middleware?)` (framework-agnostic, `platform/pageResolver.ts`) turns a Page into `{ sections, context, cachePolicy }`. The **fixed order** of resolution — documented so contributors extend the right step:

```
Page
  → Lifecycle          isPagePublished() — caller gates; preview widens it
  → [before-resolve]   localization · auth · experiment · campaign   (seam)
  → Template           resolveTemplate() — walk `extends`, merge defaults
  → Sections           composeSections() — page overrides template by id
  → Relationships      resolved lazily by sections via the relationship engine
  → Navigation         carried on the page → RenderContext.navigation
  → SEO                carried on the page → buildPageMetadata() (UI layer)
  → Context            one RenderContext assembled here, passed to every section
  → Cache              page.cachePolicy (or derived) → route strategy
  → [after-resolve]    analytics · logging · personalization          (seam)
  → Render             SectionRenderer (UI layer)
```

The UI layer (`components/page/`) is thin over this: **`PageView`** (resolve → JSON-LD → SectionRenderer) and **`buildPageMetadata`** (`seo` → Next `Metadata`).

Six forward-looking contracts ship now (shape, not full implementation):

- **Cache policy** — `cachePolicy: { mode: static|isr|dynamic|preview; revalidate?; tags? }`. Rendering strategy is part of the **page model**, not the route, so it survives a framework change. `resolveCachePolicy()` derives a default from lifecycle when unset (*Resolve → Cache → Render*).
- **Page events** — `events: { emits: (viewed|scrolled|completed|cta)[]; scrollDepths?; trackingId? }`. The analytics seam, mirroring Section events; implementation [Future].
- **Middleware seams** — `PageMiddleware { beforeResolve[]; afterResolve[] }`. Reserved extension points around resolution (localization/auth/experiment/campaign in; analytics/logging/personalization out). Loops exist; no hooks ship today.
- **Preview session** — `preview: boolean` stays; `PreviewSession { draftId?; editor?; expiresAt?; reason? }` is the shape it grows into for the CMS. A session implies preview.
- **Page manifest** — `manifest: { displayName?; previewAsset?; purpose?; owner? }`. CMS identity, never rendered — mirrors the Template manifest.

---

## 6. Sections — type **+ variant** + envelope  **[P8]**

A Section is never duplicated for a new look or season — it has a **`variant`** and a CMS **envelope**.

```ts
interface SectionInstance {
  id; type: SectionType; variant: string;
  order; visibility;
  themeToken?; editorialMood?;
  spacing?: "sm"|"md"|"lg"|"xl";
  animation?: "none"|"fade"|"rise"|"settle";
  layout?: string; background?: AssetRef | ThemeToken;
  campaignOverrides?: Record<string, Partial<SectionInstance>>;   // [P8 shape; activation Future]
  schedule?; trackingId?; experimentId?;                          // [Future]
  settings: Record<string, unknown>;
  blocks?: BlockInstance[];
}
```

**Variants** (one component, many looks):

| Section | Variants |
|---|---|
| Hero | classic · minimal · immersive · editorial · cinematic · campaign |
| Story | image-left · image-right · centered · fullscreen · quote-overlay · magazine |
| Quote | hairline · plain · large · over-image |
| FeaturedProduct | spotlight · split · editorial |
| ProductCollection | rail · grid · paired · staggered |
| Gallery / EditorialWorld | spread · mosaic · column · campaign |
| Divider | hairline · labelled · spacer |
| HoursGroup (Air) | room · linen |

**Section Registry** (`type → {component, variants, settingsSchema, defaultEnvelope}`) · **`SectionShell`** applies the envelope · **`SectionRenderer`** filters/sorts/resolves-campaign/renders.

Homepage components seed the library: `Hero→Hero`, `BrandStory→Story`, `Words→Quote`, `EditorialWorld→Gallery`, `ChapterRail→NextChapter`, `Atmosphere→FeaturedExperience`, `Invitations→InvitationPair`, `TheLetters→Newsletter`. *(Registered, not rewritten — the committed homepage keeps working.)*

---

## 7. Blocks — a registry, like Sections  **[P8: model + core blocks]**

```ts
interface BlockInstance { id; type: BlockType; order; visibility; settings; }
type BlockType = "Quote"|"Image"|"Product"|"Divider"|"Button"|"Video"
              | "Statistic"|"Table"|"GalleryImage"|"HourEntry"|"RichText";
```
A `ProductCollection`'s blocks are `Product`; a `Gallery`'s are `GalleryImage`; an Air `HoursGroup`'s are `HourEntry` (`time · name · story · assetRef · productSlug`). **BlockRegistry/BlockRenderer** mirror the section engine.

---

## 8. Atoms  **[P8: ProductCard · AssetImage · PriceTag]**

Pure, no data fetching: **`ProductCard`** · **`AssetImage`** (responsive, focal-point aware) · **`PriceTag`** (`From ₹X`) · **`TextLink`** · **`Hairline`** (gold chapter signature) · `Badge` · `EyebrowLabel`. Theme-token aware; used by many sections.

---

## 9. Theme Tokens & Editorial Mood  **[P8]**

**Theme Tokens** replace "light/dark" — named palettes (surface · ink · soft · accent · line) selected by reference:
```
warm-ivory · dark-library · forest · clay · sand · monsoon · winter · campaign-*
```
Each Volume carries its own (Vol I `clay` · Vol II `forest` · Vol III `dark-library`), so chapters never look identical. Defined once (CSS custom-property sets via `data-theme`); referenced by name.

**Editorial Mood** is a *taxonomy type* (§10), not styling: `quiet · morning · slow · warm · reflective · rain · forest · dessert · night · archive · celebration` — carried on pages/sections/assets/products/stories for filtering, adaptation and merchandising.

---

## 10. Global Taxonomy  **[P8: model; full migration Future]**

A single tagging system everything references — so search, filtering and personalization are powerful and consistent.

```ts
type TaxonomyType =
  | "mood" | "season" | "collection" | "experience" | "occasion"
  | "material" | "color" | "ingredient" | "space" | "emotion";

interface TaxonomyTerm { id; type: TaxonomyType; slug; label; parentId?; }
type TaxonomyRef = string;   // a TaxonomyTerm id
```
Products, pages, sections, assets and editorial worlds carry `taxonomy: TaxonomyRef[]`. The standalone `mood`/`season` fields become taxonomy references over time (one vocabulary, no free-text drift). The **Search index** (§22) and **Personalization** (§20) read taxonomy.

---

## 11. Asset model — the Media Library  **[P8: model + AssetImage; Future: admin library]**

Images are **never raw URLs** — an **Asset** is a first-class record; components reference an `AssetRef`.

```ts
interface Asset {
  id; kind: "image"|"video";
  desktop; tablet?; mobile?; poster?; thumbnail?; blurPlaceholder?;
  role: ImageRole; focalPoint?: {x;y};            // crop never loses the subject
  dominantColor?; aspectRatio?;
  alt; photographer?; location?;
  season?; campaign?; editorialMood?;
  taxonomy?: TaxonomyRef[];
  license?: { holder; expiresAt?; usage? };
}
type ImageRole = "hero"|"support"|"detail"|"portrait"|"lifestyle"
              | "architecture"|"texture"|"people"|"macro"|"transition"|"background";
```
Gradient placeholders (`gradient:grad-chai`) become **placeholder Assets** → Cloudinary by data swap. **`AssetImage`** picks the right source per breakpoint, honours `focalPoint`, lazy-loads (priority hero), uses the blur LQIP.

---

## 12. Editorial World — a content type, not a "Gallery"  **[P8: promote §7 model]**

The §7 Editorial World becomes a **reusable content type**; the homepage gallery, a chapter gallery and a campaign gallery all **reference an EditorialWorld by id**.

```ts
interface EditorialWorld {
  id; title; campaignId?; editorialMood?; themeToken?; taxonomy?: TaxonomyRef[];
  stories: EditorialStory[];   // role (Opening/Ritual/Detail/Still Life/Closing) + AssetRef + product links + location + mood + caption + SEO
}
```
A `Gallery`/`EditorialWorld` **section** renders a referenced world in a chosen variant. `config/editorialWorld.ts` is the seed; it graduates raw `image` → `AssetRef`.

---

## 13. Product Relationship engine  **[P8: model + resolvers]**

A product belongs to **many** experiences. Keep `products.collection_id` as the *primary chapter*; add a relationship layer for everything else.

```ts
type RelationType = "chapter"|"campaign"|"bundle"|"gift-guide"
                  | "editorial-world"|"related"|"mood"|"season"|"homepage";
interface ProductRelationship { productId; relationType; targetType; targetId; role?; sortOrder?; }
// getProductsFor(relationType, targetId) · getRelationsOf(productId)
```
Kashmiri Chai can be in the Dessert Chapter, a campaign, a gift guide, an Editorial World story and a bundle at once — no duplicated rows.

---

## 14. Commerce domain — independent from editorial  **[Boundary [P8]; machinery Phases 11–13]**

**Editorial never owns price or stock.** A product has two faces sharing one id:

- **Product (editorial)** — name · story · assets · taxonomy · relationships (this architecture).
- **Product (commerce)** — the separate domain that owns money and availability:

```
Commerce domain  (own layer, like Shopify)
  Pricing      (GST-inclusive MRP · sale · currency)        → lib/pricing (exists)
  Inventory    (variant stock · reservations · thresholds)  → variants table (exists)
  Variants     (sku · vessel · size · price · stock)        → exists
  Bundles      (compositions · savings)                     → Phase 10
  Offers       (coupons · discounts)                        → Phase 11
  Shipping     (zones · rates · NDR)                        → Phase 13
  Taxes        (GST/HSN · CGST/SGST/IGST)                   → Phase 12
  Availability (status · region · currency)                 → Phase 11–17
```
The editorial layer references a product by id/slug and reads **commerce-projected** facts (a price range, in-stock flag) through a thin read API — it never imports inventory or tax logic. Most of this exists or is scheduled in the commerce phases; Phase 8 only formalizes the **boundary** (and `ProductCard` reads price via the commerce projection, never raw fields).

---

## 15. Navigation layer  **[P8: resolvers; Future: admin graph]**

A platform navigation graph resolves `parent · children · previous · next · related · campaign · chapter · journey` from experience/journey membership + order — breadcrumbs, "Vol I → Vol II", and chapter rails are computed, never hardcoded.

---

## 16. The engines  **[P8]**

`SectionShell` (envelope) · `SectionRegistry`/`SectionRenderer` · `BlockRegistry`/`BlockRenderer` · **Template engine** (a template = the default `Section[]` for an experience/page-type; the page's own `sections[]` override it).

---

## 17. Templates

**A — Editorial Chapter** (`candle-chapters`, `/chapters/[slug]`, bound to a DB `collection`):
> Hero (cover) → Opening Story → Featured Fragrance (hero candle) → Supporting Fragrances → Editorial Quote → Atmosphere Gallery → Discover the Next Chapter → footer. Per-Volume theme token. No filters/sidebars/dense grids.

**B — Air Chapters / The Hours** (`air-chapters`, `/collections/[slug]`, *new data shape*):
> Cinematic Hero ("The Hours Collection · Volume I · The Everyday") → Shared Hours (Room): hour-nav + alternating Hour Blocks → Divider ("Private Hours") → Private Hours (Linen): Hour Blocks → Future Volume Teaser → footer. Each Hour = a diary entry (`time · name · story · asset`) → its Room/Linen spray. Unlimited volumes.

**C — Shop** (`shop`, `/shop`): Filters (`fragrance_family` · `mood_tags`/taxonomy) → ProductCard grid → pagination/sort. The one functional PLP.

**Fragrance Library** (`/chapters` index): a stack of **Volume** sections, each with its own photography + candles. **[Future] Journal · Campaign · Gift** reuse the same engine.

---

## 18. Content workflow & lifecycle  **[P8: status enum; Future: GUI/cron]**

Content moves through a real editorial workflow (designer · marketing · editor · founder):

```ts
type PageStatus = "draft" | "review" | "approved" | "scheduled" | "published" | "archived";
```
- **draft → review → approved → scheduled → published → archived.**
- `publishAt · startAt · endAt` schedule activation; **feature flags** (hide Air Chapters; date/campaign-gated) ride on `visibility + schedule + campaignId`.
- **No git-style version history here** — `variant` + `campaignOverrides` + theme tokens cover seasonal looks; true per-document version history is an **Admin-CMS** feature (later).
- **CMS preview** (view "Winter Campaign" before publishing) is an Admin-phase capability; the `status`/`draft` fields make it possible.

---

## 19. SEO engine  **[P8]**

One engine, per page, CMS-driven; `generateMetadata` reads it:
```ts
interface SeoMeta { title; description; keywords?; canonical?; ogImage?: AssetRef; twitterCard?; structuredData?; breadcrumb?; }
```

---

## 20. Personalization layer  **[Future — model now]**

The model exists now so the homepage/chapters can adapt later with no redesign ("Good evening. Continue exploring Rain Chapters").

```ts
interface PersonalizationProfile {
  subjectId;                       // session or user
  preferredMoods?: TaxonomyRef[]; preferredChapters?: string[];
  interestedCollections?: string[];
  previouslyViewed?: string[]; recentlyVisited?: string[];
}
```
Drives adaptive ordering/copy (sections sort/filter by it) when activated — no component changes, ordering only.

---

## 21. Event system  **[P8: model + emit seam; Future: sink/analytics]**

Everything emits **platform events**, so analytics/experiments/personalization are possible later.

```ts
type EventType = "viewed"|"clicked"|"opened"|"subscribed"|"purchased"|"shared"|"downloaded"|"campaign-opened";
interface PlatformEvent {
  id; type: EventType; at;
  actor: { sessionId?; userId? };
  target: { type; id };            // section · product · page · asset · campaign
  context?: { experienceId?; journeyId?; pageId?; sectionId?; campaignId?; experimentId? };
  meta?;
}
function emitEvent(e: PlatformEvent): void;   // no-op/console seam now → sink (GA4/DB) later
```
Sections expose `trackingId` (§6); the `emitEvent` seam ships now (does nothing/logs), the sink wires in the analytics phase.

---

## 22. Designed-for, built later  **[Future]**

Fields/structure present now; machinery lands in its phase:
- **Analytics sink** (events → GA4/DB · CTR · experiments) — Phase 16.
- **Search index** — pages · products · chapters · stories · hours · gallery · campaigns (post-launch).
- **Localization** — `locale` → en · fr · ja · ar (post-launch).
- **Admin / visual section editor · CMS preview · scheduled activation · media-library DB · content version history** (Phase 15+).
- **Editorial Collections** (journal/recipe/travel/tea) — same Section engine.
- **Commerce machinery** — offers/shipping/taxes/availability (Phases 11–13).

---

## 23. Phase 8 scope (build-now core)

1. **Hierarchy types** — Platform/Experience/Journey?/Page/Section/Block/Atom + **DesignSystem** object.
2. **Page metadata** — identity · SEO · navigation graph · status workflow · schedule fields · palette · taxonomy.
3. **Theme system** — theme tokens + editorial mood (built *before* the section engine).
4. **Asset system** — Asset model + `AssetImage` (gradient placeholders as Assets; Cloudinary-ready).
5. **Taxonomy** — the model + core terms.
6. **Product-Relationship** — model + resolvers; **Commerce boundary** (price via projection).
7. **Editorial World** — promoted content type.
8. **Section engine** — registry · renderer · shell · variants.
9. **Block registry** + core blocks; **Atoms** (`ProductCard`, `PriceTag`).
10. **Template engine** + **CMS config** (typed page/section configs).
11. **Event** model + `emitEvent` seam; **Personalization** model (shapes only).
12. **Template A — Candle Chapters** end-to-end, then the Library index.

**Deferred:** Air (B), Shop (C), and all **[Future]** items.

---

## 24. Build order (no UI before data models)

```
1.  Architecture Document        ← this file (+ ARCHITECTURAL_PRINCIPLES.md)
2.  Data Models                  (hierarchy · design-system · page · section · block · asset · taxonomy · product-relationship · editorial-world · commerce-boundary · event · personalization)
3.  Theme System                 (theme tokens · editorial mood)     ← before the Section Engine
4.  Asset System                 (Asset · AssetImage · placeholder→Cloudinary)
5.  Relationship Engine          (product relationships · resolvers)
6.  Section Engine               (registry · renderer · shell · variants · block registry)
7.  Template Engine              (templates as default Section sequences)
8.  Page Builder                 (typed page/section configs — the homepage pattern)
9.  Chapter Pages                (Template A · /chapters/[slug] · Library index)
10. Air Chapters                 (Template B · The Hours)
11. Shop                         (Template C)
12. Admin                        (visual editor · preview · scheduling · version history)  [later phase]
```

---

## 25. Data-source strategy

**Config-first now, DB + admin later** — the homepage pattern. Phase 8 ships the models + engines + typed config sources (design-system · pages · sections · assets · taxonomy · relationships · editorial worlds · events); candle chapters read products from the **DB** (`collectionService`/`productService`) via the **commerce projection**, while composition/assets/relationships live in **typed config** until the Admin/CMS phase migrates them to the DB with no component changes.
