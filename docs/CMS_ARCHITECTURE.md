# Samorah CMS — Architecture & Data Flow

> The single reference for the CMS. Read this before touching any CMS code: it explains
> every framework and flow so you don't have to reverse-engineer them. Each section is
> small, with a diagram and the files that implement it.

## 0. The five ideas everything is built on

1. **Publishable Resource** — one lifecycle (draft → preview → publish → schedule →
   revisions) shared by every content type. `src/lib/cms/publishable.ts`.
2. **Composable Page Engine** — pages are an ordered list of typed sections, driven by
   a generic engine; Homepage/About/Journal are just consumers. `pageComposerService.ts`.
3. **Schema DSL** — each section/email declares typed fields; the admin auto-generates
   the editor and validates against it. `src/lib/cms/sectionSchema.ts` + `SchemaForm`.
4. **Single-source Media** — every asset is one `media` row referenced by id; usage is
   a reverse lookup. `mediaService.ts`.
5. **Config fallback** — the storefront reads DB → falls back to code config, so nothing
   is ever blank before it's authored.

---

## 1. Publishable lifecycle (the spine)

Every managed resource (pages, navigation, homepage/about/journal, email) carries the
same shape and the same read-time visibility rule — **no cron**.

```
        draft ───────────────►  (editing / preview)
          │  Publish                     ▲
          ▼                              │ Save draft / Autosave (30s)
     ┌──────────┐   publish_at reached   │
     │published │◄───── scheduled ───────┘
     └────┬─────┘  (isLive computed per request)
          │ unpublish_at reached
          ▼
        hidden ─► storefront falls back to config

  isLive(row, now):                          publishState → live | scheduled |
    published → live unless before publish_at   unpublished | draft   (admin badge)
              or at/after unpublish_at
    scheduled → live only once now ≥ publish_at
    draft     → never live
```

- **draft** = work in progress (what Preview shows). **published** = live copy.
- Scheduling is **read-time**: crossing `publish_at` makes it live, `unpublish_at` hides
  it — evaluated per request, so nothing depends on a job firing.
- Files: `src/lib/cms/publishable.ts` (`isLive`, `publishState`).

## 2. Composable Page Engine

A page is `page_key + Section[]`. One table, one engine, many consumers.

```
  Homepage ─┐   About ─┐   Journal ─┐        each is a thin service that supplies
            │          │            │        { validTypes, defaultSections } and
            └──────────┴────────────┴──►  pageComposerService  ◄── the generic engine
                                              │  (draft/published/schedule/revisions/cache)
                                              ▼
                                         composed_pages (page_key PK)
```

- Consumer files: `homepageService.ts`, `aboutService.ts`, `journalService.ts` — each is
  ~1 page of thin wrappers around `pageComposerService`.
- A **new page type ≈ 70 lines**: a service + a `/route` + an `/admin/route` + 3
  registrations (page-type, `composablePages` entry, nav). Proven by Journal.
- Storefront render: `<ComposedSections sections={…} />` maps each section `type →
  component` and merges DB settings over the config baseline.
- Table: `composed_pages(page_key, draft, published, status, publish_at, unpublish_at)`.

## 3. Schema DSL & Section Registry (auto-forms)

Each section type declares a **field schema**; the admin renders the editor from it —
no hardcoded forms. Adding a section type = register a component + a schema.

```
  Composable Page Registry (pageRegistry.ts)
     key "homepage" → { hero: {schema, defaults}, testimonials: {…}, … }
     key "about"    → { hero, brand-story, words, testimonials, letters }   ← reuse
     key "journal"  → { hero, words, testimonials, letters }                ← reuse
                              │
         schema.fields[]      ▼                       storefront
        ┌─────────────┐   SchemaForm (admin)      resolveContent(schema,
        │ FieldDef    │  auto-generates inputs      configDefaults, settings)
        │ type,label, │  + inline validation          = schemaDefaults ⊕
        │ required,   │  + conditional showIf           configDefaults ⊕ settings
        │ validation, │  + nested blocks              → component props
        │ showIf,     │
        │ blocks,     │  Field types: text · textarea · richtext · url · email · media ·
        │ reference,  │    boolean · select · number · align · color · icon · date ·
        │ localized   │    datetime · reference · blocks (nestable)
        └─────────────┘
```

- Validation (declared on the field, enforced in admin **and** on publish):
  `required · maxLength/minLength · pattern · min/max · url · email · unique (in blocks) ·
  aspectRatio/allowedMime/minWidth/minHeight (media, when metadata known)` + a per-schema
  cross-field `validate()` hook.
- **Conditional fields** (`showIf`) hide fields; hidden ⇒ not validated ⇒ conditional-required.
- **Repeatable blocks** are nestable (FAQ → Q/A/images) — form + validator recurse.
- **References** (`type:"reference"`, `refEntity`) store `{entity, id}` (an ID, not a slug),
  resolved at read time.
- **Localisation seam**: fields flag `localized`; values may be locale-keyed maps read via
  `resolveLocalized()`. The data model is locale-ready today; the multi-locale UI is deferred.
- Files: `src/lib/cms/sectionSchema.ts`, `pageRegistry.ts`, `components/admin/SchemaForm.tsx`,
  `config/homepageSchemas.ts` (the section definitions).

## 4. Draft & Preview flow

```
  Editor edits draft ──► Save draft (composed_pages.draft, status=draft)
        │                     ▲  Autosave every 30s (snapshot diff)
        │ Preview
        ▼
  set cookie <page>_preview=1 ──► open previewPath in tab / iframe (desktop/tablet/mobile)
        │
        ▼
  (store) route: cookies() has *_preview AND requireStaff(editor) ok
        │  → getPageSections({ preview:true }) returns DRAFT (bypasses cache)
        ▼
  Storefront renders the draft with a "Previewing draft — not live" banner
```

- Preview is **staff-gated** (cookie + `requireStaff`) and bypasses the cache.
- Responsive preview = an in-admin iframe at desktop/tablet/mobile widths.

## 5. Revision flow (unified)

One store for every resource — `cms_revisions(resource_type, resource_key, snapshot)`.

```
  Publish/save ──► snapshotRevision(type, key, snapshot)  ─► cms_revisions (append-only)
  History panel ─► listRevisions(type, key)               ◄─ newest first
  Restore ──────► getRevisionSnapshot(id) → write back to DRAFT (non-destructive)
```

- Restore writes an old snapshot back into the **draft** (review, then re-publish) — it
  never silently overwrites live content.
- File: `src/services/cms/revisions.ts`.

## 6. Media references & usage (single source)

**Every visual asset is ONE `media` row, referenced by `media_id` everywhere — never a
copied URL.** The anti-pattern (a hero URL copied into homepage + banner + media tables)
is what this prevents.

```
                    ┌────────────────────┐
                    │       media        │ ← provider+public_id+url, alt, role, dims,
                    │  (Cloudinary/URL)  │   focal, folder, tags   (single source)
                    └─────────▲──────────┘
        media_id (reference)  │
   ┌──────────┬───────────────┼───────────────┬──────────────┐
 cms_pages   composed_pages  navigation     email blocks    products
 (sections   (section         (campaign      (media fields)  (gallery)
  + seo)      settings)        imagery)
                    │
   getMediaUsage(id) = reverse lookup across ALL consumers → "used by" list
   deleteMedia BLOCKED while used → an asset can't vanish from a live page
```

- Usage is computed (reverse lookup), never a stored counter that can drift.
- Files: `src/services/media/mediaService.ts` (`getMediaUsage`, `deleteMedia`),
  `mediaProvider`/`cloudinaryProvider` (swappable storage).

## 7. SEO pipeline

Per-route overrides layered over global defaults; wired into `generateMetadata`.

```
  site_settings.seo (global defaults)  ─┐
                                         ├─► getRouteSeo(path)  ─► withRouteSeo(path, base)
  seo_overrides[path] (per-route:        │        (override wins)        │  (overlay)
   title/desc/OG/robots/canonical/       │                               ▼
   sitemap priority/changefreq)  ────────┘                    route generateMetadata
                                                              (home, shop, product,
   cms_pages.seo — per-CMS-page (separate; owned by the page)  collection, chapter, about…)
```

- One line per route: `return withRouteSeo("/shop/"+slug, base)`.
- JSON-LD stays typed per-route in code. Files: `seoRedirectService.ts`.

## 8. Redirect pipeline

DB-driven 301/302 applied in middleware, cached so it's not a per-request DB hit.

```
  request ─► middleware
              │ 1. canonical host (301)
              │ 2. resolveRedirect(path):  getRedirectMap() [module TTL cache 60s]
              │        └─ REST fetch redirects(enabled) → Map<from,{to,code}>
              │        └─ normalise case + trailing slash · skip self-loops
              │    match → NextResponse.redirect(to, code)
              ▼ 3. updateSession
           (route)
  Admin saves a redirect ─► takes effect within the 60s TTL. Loops (from=to) rejected.
```

- Files: `src/lib/redirects.ts`, `src/middleware.ts`, `seoRedirectService.ts` (admin CRUD).

## 9. Cache invalidation

Live reads are cached under a per-resource tag; publishing invalidates instantly.

```
  getLiveNavigation / getPageSections / getHomepage  ── unstable_cache(tag)
        ▲                                                     │
        │ next request served from cache                      │
  Publish/Reset (API route) ── revalidateTag("navigation" | "page:homepage" | …)
        └─ next read recomputes; preview reads always bypass the cache
```

- Tags: `navigation`, `page:<key>`, `homepage` (alias). Preview never caches.

## 10. Email as blocks (same engine)

The email body is authored as structured blocks via the **same SchemaForm** — no HTML
editor. Rendered to inline-styled email HTML on send; opt-in with a safe fallback.

```
  Admin (SchemaForm, EMAIL_TEMPLATE_SCHEMA)  ─► email_templates.blocks (jsonb)
        │  Preview (server-rendered)                         │
        ▼                                                    ▼
  renderEmailBlocks(blocks, vars) → inline HTML     send: notifications/channels/email
        heading·paragraph·button·note·divider·details          if authored blocks → use them
        {{tokens}} interpolate                                  else → coded builder (+ subject override)
```

- Files: `src/lib/email/blocks.ts`, `services/emailTemplateService.ts`,
  `lib/notifications/channels/email.ts`.

## 11. Content locking (multi-editor)

Advisory only — warns, never hard-blocks (no lockout footguns).

```
  Editor opens Page Builder ─► acquireLock(page:<key>)  [heartbeat every 30s]
        another editor opens ─► sees "currently edited by <name>"
        lock stale after 90s ─► can be taken over (a closed tab never blocks forever)
        unload ─► releaseLock via sendBeacon
```

- Files: `src/services/cmsLockService.ts`, `/api/admin/locks`, wired in `PageBuilder`.

---

## Invariants for every new CMS feature (checklist)

- [ ] Assets referenced by `media_id`. **No URL columns** outside `media`.
- [ ] User-facing content is a **Publishable Resource** (draft/published + `isLive`).
- [ ] Editors are **schema-generated** (add fields to a schema, not a hand-built form).
- [ ] Mutations `logEvent` and snapshot a revision (`cms_revisions`).
- [ ] Storefront reads go through a service that resolves media + schedule; components
      stay asset-shape-only; DB → config fallback.
- [ ] Deleting an asset consults `getMediaUsage()` first.
- [ ] Live reads are tag-cached; publish calls `revalidateTag`.

## Slice status

Pages ✅ · Media ✅ · Navigation ✅ (draft/preview/publish/schedule/revisions/entity-links/
SEO-attrs/validation/cache) · Homepage ✅ (schema-authored) · **Composable Page framework
✅** (About, Journal) · Email templates ✅ (subject + block bodies) · SEO/Redirects ✅ ·
Content locking + autosave ✅. Deferred: full multi-locale UI · media click-to-edit preview
· list-section→blocks for Atmosphere/Editorial-World (pattern proven on Invitations).
