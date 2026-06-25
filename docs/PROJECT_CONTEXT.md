# PROJECT_CONTEXT — Samorah (living memory)

> **This file is the project's primary source of truth and living memory.**
> Read it first, every session, before any implementation. It records *what is
> decided and why*, *where we are*, and *what is deferred*. When a new
> architectural / design / UX / database / branding decision is approved, append
> it to the **Decision Log** (§5) and, if it defers work, the **Pending /
> Deferred** register (§6).
>
> **Conflict rule:** if implementation and documentation disagree, **stop and
> name the conflict** before writing code. Never silently replace an approved
> decision. If a document is missing or outdated, say exactly which one.
>
> **Last updated:** 2026-06-26 · Phase 7 §1–§4 built. §4 "The Atmosphere" shipped (Decision 18, refined): fragrance-led & product-agnostic, "Featured Atmosphere" heading, Scene·Memory·Atmosphere·Fragrance Journey, data-driven CTA + campaign-priority ordering, provisional Atmosphere Index (Pending P15). Next: §5 Air + Bundle.

---

## 1. What Samorah is

**SAMORAH** — a luxury handmade scented-candle e-commerce platform for India.
The product is framed as a *fragrance library* of **Chapters** (Vol. I–IV) and
**Collections** (the Air/Hours lines). Voice: literary, sensory, unhurried.
Aesthetic: editorial luxury (Trudon · Dior Maison · Diptyque · Aesop · Loewe ·
The Row), never generic e-commerce.

**Origin:** a Vite/React browse-only prototype (now in [`legacy/`](../legacy)).
We are **re-platforming** it to the BRD-mandated stack while treating the
prototype as the **locked design + content source of truth**.

## 2. Stack

- **Next.js 15** (App Router, RSC) · **TypeScript** · **React 19**
- **Tailwind CSS v4** (`@tailwindcss/postcss`) + the ported prototype design system in [`globals.css`](../src/app/globals.css)
- **Supabase** — Postgres, Auth (`@supabase/ssr`), RLS, SECURITY DEFINER, pg enums; **`@supabase/postgrest-js`** for DB-only reads (avoids the Node-20 WebSocket requirement)
- **Zustand** (+ persist) for client state; hydration-safe `useStore` hook
- **Framer Motion** (now) · GSAP deferred · **lucide-react** icons
- Planned integrations: Razorpay · Shiprocket · Resend · Cloudinary
- Migrations via Supabase CLI (version-controlled; user pushes manually)

## 3. Current state

- **In progress:** **Phase 7 — Homepage** (one editorial journey, built beat by
  beat). Done: **§1 Hero** (campaign-driven) · **§2 Signature Chapters** (reusable
  Editorial Chapter Rail) · **§3 Brand Story** (titleless editorial spread) ·
  **§4 The Atmosphere** (the signature section — "Featured Atmosphere";
  fragrance-led, product-agnostic, campaign-aware; Decision 18).
  Next beat: **§5 — Air + Bundle**.
- **Completed:** Phase 6 — Layout Chrome (all chrome + refinements).
- **Working cadence (standing):** one area → one component → one file at a time;
  explain dependencies first; **stop after each subphase for approval**; commit
  only on the user's "proceed"/"commit". Avoid generic e-commerce UI.
- **Homepage per-section cadence (standing):** before building each homepage
  section, pause and explain six things — **emotional goal · layout · transition
  in · transition out · CMS structure · design rationale** — then stop for
  approval. Judge every section by: *"Does this make Samorah feel more like an
  editorial publication or more like an e-commerce store?"* If e-commerce,
  redesign it.

## 4. Phase log (completed)

| Phase | Summary | Key commits |
|---|---|---|
| 1 | Re-platform foundation: Next.js 15 + TS shell, Tailwind v4, Supabase clients, `globals.css` from prototype, fonts | — |
| 2 | Canonical DB: 33 tables across 2A–2E, RLS, enums, grants convention, invoice sequence, typed `database.ts` | migrations `20260623*` |
| 3 | State + Auth + RBAC: hydration-safe `useStore`, cart/user/wishlist stores; AuthProvider, `useAuth`, `/auth/callback`, middleware role-gating; `current_user_role()` + staff-write RLS | `20260623190441_phase_3c_rbac` |
| 4 | Product Engine — 4A seed (`scripts/seed-catalog.mjs`), 4B services (public client + product/collection/fragrance), 4C domain (`lib/pricing|product|collection|fragrance`, 54 runtime assertions) | `4ea6a96` `3241865` `cc815ff` |
| 5.5 | **SDD** v1.0 (system reference) + **SDD-VISUAL** V2 (primary visual SoT) | `c0c9122` |
| 5.6 | **SPD** v1.0 (photography / image system) | `4252185` |
| 6 | **Layout Chrome** — Announcement Bar · Header · Mega Menu · Search · Cart · Footer + refinements | `4353920` `2afb227` `c9798b7` `0120bfc` `94c7ed0` `7005ee0` `fbe89b4` |

## 5. Decision Log

> Format: **Decision · Reason · Date · Phase · Impact.**

1. **Re-platform Vite/React → Next.js 15 + Supabase; prototype is the locked design/content SoT.** · BRD mandates SSR/SSG/SEO/middleware; prototype is browse-only. · 2026-06-23 · 1 · All work; `legacy/` is the visual DNA.
2. **MVP scope = Products → Checkout → Razorpay → Shiprocket → Emails.** Loyalty, gift cards, referral, MSG91 phone-OTP deferred post-launch. · Focus the launch. · 2026-06-23 · 0 · Phases 11–17; post-launch backlog.
3. **Migration grant convention** — every migration ships explicit `GRANT`s (Supabase implicit grants don't apply to migration-created tables). · Fixes 403s. · 2026-06-23 · 2 · All migrations.
4. **DB reads via `@supabase/postgrest-js` (`createPublicClient`), not full supabase-js.** · Avoids Node-20 WebSocket/Realtime requirement. · 2026-06-23 · 4B · Public read client + seed script.
5. **RBAC: `customer < editor < manager < admin` active; `super_admin` dormant in enum. `current_user_role()` SECURITY DEFINER; staff writes via RLS.** Service role reserved for webhooks/cron/email. · DB-enforced permissions. · 2026-06-23 · 3C · Admin + all mutations.
6. **Gold reconciliation — prototype `--gold #C9A96E` + `--ivory #FAF7F2` are canonical; BRD `--accent #9C826B` retired.** · Gold is the established identity; the BRD taupe collapses against `--muted`. · 2026-06-24 · 5.5 · All UI colour. *(Overrides a BRD spec — only such override.)*
7. **Motion: Framer Motion now; GSAP deferred until after the storefront foundation.** · Framer covers reveals/overlays; GSAP unneeded yet. · 2026-06-24 · 5.5 · All animation.
8. **Doc hierarchy: SDD-VISUAL V2 = primary *visual* SoT; SDD v1.0 = *system* reference (tokens/type/motion/components); SPD = *image* SoT. V2 wins visual conflicts.** · Separate concerns; one authority each. · 2026-06-24 · 5.5A · All UI phases.
9. **Footer surface = dark charcoal (`--deep-charcoal`), page closes with weight.** · SDD §7/§12 editorial rhythm (Trudon × Loewe). *(A brief ivory experiment was reverted.)* · 2026-06-25 · 6 · Footer; matches docs.
10. **Footer IA = 5 columns Shop · Chapters · About · Help · Follow; Contact under About; Journal omitted.** · Chapters earn their own column; About carries narrative; Help = support+legal. · 2026-06-25 · 6 · Footer. **Divergence:** SDD-VISUAL §31 still lists the earlier set (Journal in About, Contact in Help) — docs intentionally not changed (see §7).
11. **Overlay coordination through `useUIStore` (menu/search/cart — one open at a time); `useCartStore` slimmed to data-only.** · Single coordinator; data store stays pure. · 2026-06-25 · 6 · All chrome overlays.
12. **Routing split: `/chapters/*` = candle Volumes; `/collections/*` = Air/Hours lines.** Plus `/shop/*`, `/bundles`, `/about/*`, `/archive`, `/contact`, `/product-care`, `/shipping|returns|terms|privacy|faq`, `/checkout`. · Resolves CHAPTERS vs COLLECTIONS. · 2026-06-25 · 6 · Nav + future page routes.
13. **Vessel sizes stay 100g / 200g / 350g for now** (mockups show 120/180/250 — deferred, not adopted). · Catalogue is seeded with these; size change = a reseed, not a layout change. · 2026-06-24 · 5.5A · Catalogue; see Pending P5.
14. **Chrome architecture: `(store)` route group + `StoreChrome` client coordinator; isolated, prop-driven components; shared `useOverlay` hook (scroll-lock/focus-trap/ESC/return-focus).** · Decoupled, testable chrome. · 2026-06-25 · 6 · All chrome + future overlays (Mobile Menu).
15. **Homepage Hero is a campaign-driven editorial component, not a static banner.** Layout/type/spacing/motion/photography *treatment* stay fixed; only campaign *content* changes (image, eyebrow, heading, copy, CTA, theme). Phase 7 already reads from a typed `HeroCampaign` (`config/campaigns.ts` + `getActiveCampaign()`); the full Campaign Manager + automatic date-scheduling is **Approved Future Architecture (§8)**, built in the Admin/CMS phase. · Timeless layout, seasonal content (Trudon/Dior/Loewe); no layout refactor and no deploy to switch campaigns later. · 2026-06-25 · 7 / future CMS · Homepage Hero + future admin.
16. **Editorial Chapter Rail = the reusable Chapter navigation system** (Homepage now; Chapters landing / Related / Explore-More later). Data-driven (no fixed count), an editorial horizontal shelf — not a carousel (no autoplay/dots/loop; architectural arrows only on overflow). CMS-ready `HomeChapter` (`config/chapters.ts`). Campaign↔chapter is `chapterSlugs[]` (one/many/seasonal); emphasis is **editorial photography only** — equal hierarchy, no featured cards/badges/borders/opacity. · Build once, reuse everywhere; choose a story, not a product. · 2026-06-25 · 7 (§2) · All chapter navigation. See §8.
17. **Homepage §3 "Brand Story" = a titleless, campaign-driven editorial spread** answering *why Samorah exists* — never an "About Us" block, and the words "Brand Story" never appear in the UI. Asymmetric ~58/42 layout where **photography is the dominant anchor and extends ~60px beyond the copy** (centred text floats inside a `minmax(660px,auto)` row); handcrafted (non-synchronised) reveal — image settles first, then eyebrow/heading/body(or `quote`)/CTA in a subtle stagger. CMS-ready `BrandStory` (`config/brandStory.ts`): `orientation` · `backgroundTone` · `photographyMood` · optional `quote`; photography shows **the making**, not the product. Copy is positive (never "what Samorah is *not*"); CTA "Enter the Studio". Future image controls (`imageCrop/imageFocus/imageMood/imageOverlay`) documented in §8, not built. · Editorial publication, not an e-commerce store. · 2026-06-25 · 7 (§3) · Homepage §3 + future CMS.
18. **Homepage §4 = "The Atmosphere" — inhabit one fragrance-world at a time, never a "Featured Product."** Full-bleed immersive room; the philosophy *is* the layout — **PLACE → FEELING → ATMOSPHERE → SCENT → CHAPTER** (emotion before composition). **Atmosphere Index** = curated emotional descriptors rendered as a **gold leader-rule index** (fine rules flush-right to a common margin, ragged-left — *an index, never a meter*; no bars/%/chips/icons; this becomes a Samorah typographic signature). **One signature sentence** lands as the crescendo *after* the Index; the **title stands alone** (no tagline). **SCENT** = First / Then / Finally (never Top/Heart/Base). Changing atmosphere makes the **whole environment breathe together** in one slow crossfade (~1.6s — *slower than the rest of the page*; reduced-motion → opacity only) — no carousel/slider/autoplay/parallax/sliding. Fully CMS-driven `config/experiences.ts` (`homepageFeatured · displayOrder · isVisible · backgroundTone · overlayStrength · campaignId · chapterSlug · place · feeling · atmosphereIndex[] · signatureLine · opening/unfolding/lingering · ctaLabel/Href · image · video?` …), campaign-aware; handles **1 / 3 / 5** identically (single → no selector; many → a quiet vertical name-index, not carousel dots). Seeded with **three fragrances** (Kashmiri Chai · Petrichor · Velvet Hour — fragrance names, **not** chapters: the title is *always* the fragrance; the chapter is secondary metadata and the product-medium label is shown separately, different treatment). **CTA is data-driven per product type** (verb fits the medium — "Discover/Experience/Explore the Ritual…") and leads to the fragrance's **product page**. **Permanent timeless heading "Featured Atmosphere"** — *this supersedes the earlier "no Featured wording / Today's Atmosphere" stance, reversed on the user's instruction (2026-06-26); it's one constant, swappable to "Experience".* Spine labels: **Scene · Memory · Atmosphere · Fragrance Journey**. CMS future-proofed for marketing: **Display Name · Sort Order · Visibility · Homepage Featured · Campaign Priority** (reorder/relabel via data, no code). Photography swaps in as the **full immersive background** with CMS overlay colour + opacity (gradient is only a placeholder). The Atmosphere Index leader-rule is a **provisional Phase 7** treatment — decorative auto-generated line lengths (never data); the whole "Atmosphere Language" is revisited after the full site + real photography (Pending P15). · The signature, most-remembered section; the page behaves the way scent-memory behaves. · 2026-06-25 (refined 2026-06-26) · 7 (§4) · Homepage §4 + future CMS. *(Built.)*

## 6. Pending / Deferred register (traced)

> Approved-but-not-yet-built work, so nothing is lost. Each names the phase that resolves it.

| # | Item | Resolve in | Notes |
|---|---|---|---|
| P1 | ✅ **DONE (Phase 7 §1)** — Header `floating` activated on the homepage | — | Absolute under the announcement → fixed ivory glass on scroll; `StoreChrome` `usePathname`; interior pages unchanged |
| P2 | **Cart auto-open-on-add** removed from `useCartStore` | Phase 9 | Re-wire at the add-to-cart call site via `useUIStore.openCart()` |
| P3 | **`onAccountClick`** unwired on the Header | account phase | Wire to auth/account; respects "no auth coupling in chrome" |
| P4 | **Search backend** = client-side JSON filter (`lib/search.ts`) | search phase (BRD P1) | Swap `searchProducts()` to server Postgres full-text behind the same signature |
| P5 | **Vessel size taxonomy** 100/200/350 vs 120/180/250 | content/catalogue | If 120/180/250 adopted → reseed variants/SKUs/prices |
| P6 | **Vessel descriptors** (Glass: clean & luminous; Ceramic: soft matte warmth; Terracotta: earthy crafted texture) | content | Add as product/variant catalogue copy |
| P7 | **Footer social URLs** are placeholders | content | Replace with real Instagram/Pinterest/Spotify handles |
| P8 | **Mega-menu / footer links 404** until target pages exist | Phases 7–11 | Expected for chrome-first build; links are correct |
| P9 | **Newsletter** intentionally outside the footer | future | A separate global section, not in chrome |
| P10 | **Mobile Menu (Component 7)** not built | post–Layout-Chrome | The Mega Menu degrades gracefully on mobile; a dedicated overlay is pending |
| P11 | **Legacy prototype CSS** superseded by `.site-*` / overlay rules (dead `.header`, dark `.footer`, marquee/search/cart keyframes) | cleanup | Remove dead rules when convenient |
| P12 | **SDD-VISUAL §31** footer listing diverges from as-built (Decision 10) | doc sync | User instructed not to change docs now; reconcile later |
| P13 | **Gradient placeholders → real photography** per SPD | Phase 17 / upload | `gradient:<class>` rows become Cloudinary IDs; gradient stays as the blur placeholder |
| P14 | **Narrative product fields** (story, flame_persona, cultural_reference, lifestyle_use, SEO) not seeded | Phase 9 / content | Seed left them null intentionally |
| P15 | **Atmosphere Language (§4 Atmosphere Index) revisit** — leader-rule is a provisional Phase 7 treatment | post-site + real photography | Decorative auto-generated lengths now; redesign the whole descriptor language once photography is integrated (Decision 18) |

## 7. Document index & authority

| Doc | Status | Authoritative for |
|---|---|---|
| `PROJECT_CONTEXT.md` (this) | ✅ living | Current state, decisions, pending work — read first |
| `Samorah_BRD_v3.pdf` + `BRD.md` | ✅ added 2026-06-25 | Business requirements (66pp): commerce, GST/HSN, webhook idempotency, admin, schema. **PDF canonical**; `BRD.md` is the greppable `pdftotext` mirror (verify exact tables vs PDF) |
| `Samorah_USD_v1.pdf` + `USD.md` | ✅ added 2026-06-25 | **User Scenario Document** (54pp) — 62 complete workflows / acceptance flows (C#/P#/A#/M# …). PDF canonical; `USD.md` is the mirror |
| `SDD.md` | ✅ v1.0 | Design **system** — tokens, type scale, spacing, motion curves, component specs |
| `SDD-VISUAL.md` | ✅ v2.0 | **Primary visual** SoT — page architecture, layouts, emotional intent, what-not-to-do (append-only, living) |
| `SPD.md` | ✅ v1.0 | Photography / image system — mood, ratios, Cloudinary, LCP, blur, alt-text |
| `ROADMAP.md` | ✅ new | Phase sequence & dependencies |

> **Reading the BRD/USD here:** this Windows env has no PDF image renderer
> (`pdftoppm`), so the repo PDFs aren't opened directly — read the **`.md`
> mirrors** (`pdftotext -layout` output) for content, and cross-check the PDF for
> exact numeric/GST/HSN tables. Reference by section/story id (e.g. *BRD §8.3*,
> *USD C2 / P6*).

### Resuming in a new chat
Read **PROJECT_CONTEXT.md** (this file) → then the doc(s) for the active phase
(`SDD` + `SDD-VISUAL` + `SPD` for UI phases 7–10; `BRD`/`USD` for commerce phases
11+). §3 = where we are, §4 = what's done, §5 = why, **§6 = what's still owed**.
Keep this file in sync: every approved change (done *or* deferred) updates §5
and/or §6 in the same turn it's decided.

**Known divergences (impl ↔ docs):**
- **SDD-VISUAL §31 footer columns** vs as-built (Decision 10 / Pending P12). Docs intentionally unchanged.
- **SDD-VISUAL §12 footer** showed a large serif statement; as-built footer is restrained (a single centred poetic line). Minor; the restrained treatment is intended.

## 8. Approved Future Architecture

> Approved direction, not yet fully built. Future phases **extend** these — never replace them.

### Homepage Campaign System (Decision 15 · 2026-06-25)

The Homepage Hero is a **campaign-driven editorial component**, not a static banner. The layout, typography, spacing, motion and photography *treatment* stay timeless; only the campaign *content* changes through the year (Trudon / Dior Maison / Loewe). **Not a carousel / slider / rotating banner — exactly one campaign is active at a time;** eventual transitions between campaigns are slow editorial crossfades in the Samorah motion language.

**Each campaign carries:** name · hero image · eyebrow · heading · subheading · CTA label · CTA destination · theme (colour mood) · is_active · display order/priority · start date · end date. *Examples:* Kashmiri Chai · Rainforest Bloom · Whispered Flame · Air Chapters.

- **Built now (Phase 7):** the Hero reads from a typed `HeroCampaign` (`src/config/campaigns.ts` + `getActiveCampaign()`) — nothing hardcoded; one open-ended campaign today.
- **Future — Homepage Campaign Manager (Admin/CMS phase):** a `homepage_campaigns` table/CMS replaces the local config (no component/layout change). **Automatic date scheduling** — the homepage shows whichever campaign is active for the current date, *no deploy to switch.* (Enabling scheduling needs the homepage to be **ISR/dynamic** so the date re-evaluates; with one open-ended campaign today it stays static.)

**Project rule:** treat the Homepage Hero — and campaign-aware sections — as campaign-driven; extend this architecture, don't replace it.

### Editorial Chapter Rail (Decision 16 · 2026-06-25)

The **`ChapterRail`** (`src/components/chapters/`) is the **reusable Chapter navigation system** — built once, reused everywhere (Homepage now; Chapters landing · Related Chapters · Explore-More · editorial nav later). Data-driven (**never a fixed count**), an **editorial horizontal shelf, not a carousel** (no autoplay/dots/loop; architectural arrows appear only on overflow, native swipe on touch). Chapters are CMS-ready typed `HomeChapter` objects (`config/chapters.ts`): title · subtitle · editorial image · mood · description · CTA · display order · visibility.

**Campaign ↔ chapters:** a campaign's `chapterSlugs[]` may feature **one, several, or seasonal** chapters; emphasis is expressed **only through editorial photography** (the active chapter receives current imagery) — **hierarchy stays equal**, never larger cards / badges / borders / opacity. *Rule: the visitor chooses which story to enter, never a product.*

### Brand Story editorial image controls (future — not implemented)

So every future campaign can use different photography with no CSS/component change, the Brand Story (§3) image will gain optional editorial controls: **`imageCrop` · `imageFocus` · `imageMood` · `imageOverlay`**. The model already carries `image`, `imageAlt`, `photographyMood`, `orientation` (+ optional `quote`); these four extend that set when the CMS lands.

---

## 9. Operational notes

- **Windows + `next dev`:** a running dev server locks `.next/trace` and makes `npm run build` hang/EPERM. Stop node processes before a clean build; restart `npm run dev` afterwards.
- **`.env.local`** holds real secrets (Supabase project `fzrkjozezkncwewmhoru`) and is gitignored — keep it so. CRLF line endings (Windows).
- **Repo facts** (don't re-record here): code structure, table list, and past fixes live in git history + the migrations + `database.ts`.
