# SAMORAH — Architectural Principles

> **The constitution of the platform.** Read this before touching code. It exists to prevent architecture drift: when a decision is unclear, these principles decide it. They outrank convenience, deadlines and "just this once."
> **Companion to:** `PAGE_ARCHITECTURE.md` (the models this enforces).

If a change requires violating a principle, that's a signal the architecture needs a conscious amendment — raise it and record the decision in `PROJECT_CONTEXT.md`, don't quietly route around it.

---

## Structure & domains

1. **Experience before Product.**
   Everything belongs to an Experience; the platform never assumes "candles." New lines (incense, diffuser, perfume, tea, objects) are data, not code. *Forbids:* hardcoding a product type into a template or component.

2. **Editorial before Commerce.**
   The page tells a story; products are one part of it. We design the feeling first, then attach the cart. *Forbids:* PLP patterns (filter sidebars, dense grids, sort bars) leaking into editorial templates.

3. **Commerce is its own domain.**
   Price, inventory, tax, shipping and availability live in the Commerce layer. Editorial references a product and reads a *projection* (a price range, an in-stock flag). *Forbids:* a section importing inventory/tax logic or reading raw money fields.

4. **Domains remain independent.**
   Editorial never knows inventory; commerce never knows layouts; media never knows products; navigation never knows pricing. Domains communicate through defined contracts. *Forbids:* cross-domain imports. *(Critical after year two.)*

5. **API before Interface.**
   Business logic lives in services; interfaces consume services. A future mobile app, POS, marketplace or wholesale portal must be able to use the same logic. *Forbids:* business rules inside React components.

## Content & data

6. **Content before Components.**
   Model the data first; build the UI second. *No UI before data models.* *Forbids:* starting a feature by writing JSX.

7. **Configuration over Hardcoding.**
   Order, visibility, theme, copy, imagery and relationships are data; changing a page is a data change. *Forbids:* literal strings/URLs/ordering baked into components.

8. **Relationships over Duplication.**
   One source object, many memberships — a product belongs to many experiences via relationships, not copied rows. *Forbids:* duplicating a product/asset to place it twice.

9. **Assets before URLs.**
   Images are Assets (responsive sources · role · focal point · alt · rights · mood), never raw URLs. *Forbids:* `image: "https://…"` in a component or content row — reference an `AssetRef`.

10. **Theme Tokens over Colours.**
    Surfaces and ink come from named theme tokens (`warm-ivory`, `forest`, `dark-library`…), so a chapter or campaign re-themes by reference. *Forbids:* literal hex / `light|dark` in a section.

11. **Taxonomy over Free Text.**
    Mood, season, occasion, material, colour, ingredient, space, emotion are taxonomy terms — one vocabulary powering search, filtering and personalization. *Forbids:* ad-hoc tag strings.

12. **AI Ready by Design.**
    Data is structured so humans *and* AI understand it; every product, asset, story and experience exposes rich, explicit metadata. *Forbids:* storing important meaning only inside paragraphs or images. *(Future-proofs recommendations, search, SEO, generation.)*

13. **One Source of Truth.**
    Each fact has exactly one home (price → commerce, copy → content, palette → theme token, decision → `PROJECT_CONTEXT`). *Forbids:* the same value defined twice.

## Composition & craft

14. **Composition over Templates.**
    Pages are assembled from Sections and Blocks chosen from registries; a new look is a **variant**, never a new component. *Forbids:* `HeroWinter`, `HeroLuxury`, `Story2`.

15. **Consistency before Novelty.**
    Every new section feels like it belongs to the same publication. If a component needs many exceptions, fix the component — don't add more options. *Forbids:* component/option explosion.

16. **Every Component is CMS-ready.**
    Section/block components are pure and prop-driven — they render what they're handed, fetch nothing, import no page-specific config. *Forbids:* a section importing `BRAND_STORY` instead of taking it as `settings`.

17. **Animation serves Storytelling.**
    Motion is restrained, reduced-motion-safe, and always in service of the narrative — never decoration or spectacle. *Forbids:* parallax, autoplay carousels, hover-lift cards, bouncing, confetti.

18. **Performance before Decoration.**
    Luxury means effortless — every interaction feels immediate, and the site stays fast as editorial richness grows. Every image, animation and effect must justify its performance cost. *Forbids:* unnecessary JS · render-blocking animation · oversized images · multiple libraries solving the same problem.

## Experience for everyone

19. **Progressive Enhancement.**
    Core content is accessible without advanced effects; enhancements layer on top, never become requirements (old iPhones · Safari · low bandwidth · screen readers). *Forbids:* interfaces that depend on JS/animation to reveal essential content.

20. **Accessibility is not optional.**
    Real semantics, labels, keyboard operability, visible focus, `aria-live` for async, reduced-motion — on every interactive thing, from day one. *Forbids:* div-buttons, unlabeled fields, removing focus states.

21. **Security by Default.**
    Protect data by default · validate inputs · escape outputs · least-privilege access · never expose secrets in the client. *Forbids:* trusting client input; secrets in client code. *(Reserved now; load-bearing once auth, admin, CMS and payments exist.)*

## Longevity & operations

22. **Versions over Breakage.**
    The Design System is versioned so a future redesign never breaks shipped content; pages can pin a version. *Forbids:* a token/component change that silently alters every live page.

23. **Content Outlives Campaigns.**
    Campaigns are temporary; content is permanent. A campaign *layers over* the platform — it never permanently alters reusable editorial content. *Forbids:* a campaign mutating shared content or assets.

24. **Events over Guesswork.**
    Meaningful interactions emit platform events through one seam, so we learn what resonates. *Forbids:* one-off analytics scattered through components.

25. **Document Decisions.**
    Architectural decisions are recorded once in `PROJECT_CONTEXT.md` — never memory or chat. If the architecture changes, **update the docs before implementation.** *Forbids:* undocumented architecture changes.

26. **Commerce, thoughtfully integrated.**
    Samorah should always feel like an **editorial publication with commerce woven in naturally**. Cart, checkout, wishlist, orders, subscriptions and gift cards are not violations — they are editorial moments too. The goal is not to avoid commerce; it is to make commerce feel like a natural extension of the story. *(The functional `/shop` is the deliberate, pragmatic workhorse.)*

27. **Build for the Next Five Years, not the Next Five Days.**
    Every architectural decision favours long-term clarity over short-term convenience. Temporary shortcuts are acceptable **only** when explicitly documented with a planned removal. This is the philosophy of Samorah.

---

## When in doubt

- **Where does this value live?** → the one domain that owns it (One Source of Truth). If unsure, it's probably content or theme, not the component.
- **New look needed?** → a `variant` + theme token, not a new component (Composition · Consistency).
- **New page?** → it belongs to an Experience, is built from Sections, pulls copy/products/assets from data.
- **Adding a field?** → a tag is Taxonomy; money/stock is Commerce; an image is an Asset.
- **Business rule?** → a service, never a component (API before Interface).
- **Tempted to hardcode or cross a domain boundary?** → don't — make it a setting/contract, or amend the architecture and document it.

## How to extend the platform

- **Add a section type** → a pure component + settings schema, registered with its variants. No page edits to use it.
- **Add a block** → same, in the Block Registry.
- **Add a page** → its config (experience · slug · template · SEO · sections[]); navigation resolves automatically.
- **Add imagery** → Assets (role · focal point · alt); reference by `AssetRef`.
- **Add a relationship** → a `ProductRelationship` row; resolvers surface it everywhere.
- **Add business logic** → a service in the right domain; the UI consumes it.
