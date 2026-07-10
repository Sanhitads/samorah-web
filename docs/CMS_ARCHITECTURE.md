# Samorah CMS — Architecture & Data Flow

> The reference for every CMS slice (Pages ✅ · Media · Navigation · Homepage ·
> Email Templates · SEO · Redirects). Its job: keep the slices **consistent** and
> stop the single most expensive CMS mistake — **duplicated asset models**.

## The one rule that governs everything

**Every visual asset is ONE row in `media`. Everything else references it by `media_id`
— never by copied URL.**

```
                          ┌───────────────┐
                          │     media     │   ← single source of truth for every asset
                          │  id (uuid)    │      (image / video / og-image / email hero)
                          │  storage_path │   ← the ONLY place a URL/path is stored
                          │  alt, width,  │
                          │  height, kind │
                          │  folder, tags │
                          └───────▲───────┘
                                  │ media_id (FK)  — reference, NOT a copied URL
      ┌───────────────┬───────────┼───────────────┬──────────────────┐
      │               │           │               │                  │
 ┌────┴─────┐   ┌─────┴─────┐ ┌───┴──────┐  ┌──────┴──────┐   ┌───────┴───────┐
 │ cms_pages│   │ homepage_ │ │ navigation│  │ email_       │   │  products /   │
 │ .sections│   │ sections  │ │ (icons?)  │  │ templates    │   │  variants     │
 │ .seo.og  │   │ (hero,    │ │           │  │ (hero,logo)  │   │ (gallery)     │
 │          │   │  banner)  │ │           │  │              │   │               │
 └──────────┘   └───────────┘ └──────────┘  └──────────────┘   └───────────────┘
      │                                                                │
      └──────────────► seo (per-page meta/OG) ◄───────────────────────┘
```

### Why this rule matters (the anti-pattern to avoid)

The tempting-but-wrong shape the user flagged:

```
Hero image URL copied into → homepage table
                          → media table
                          → banner table      ✗  three copies, three sources of truth
```

When the same hero lives as a raw URL in three tables:
- Re-cropping or replacing it means editing three rows (and you'll miss one).
- "Is this asset safe to delete?" is unanswerable — no table knows who uses it.
- Alt text / dimensions drift per copy → accessibility + CLS bugs.

With **reference-by-id**, the asset has one home; consumers point at it; usage is a
reverse lookup (below); replacing the file updates everywhere at once.

## Entities & relationships

| Entity | Holds | References |
|---|---|---|
| **media** | the file (storage_path), alt, kind, dimensions, folder, tags | — (root) |
| **cms_pages** ✅ | slug, title, eyebrow, intro, `sections[]`, `seo{}`, schedule, status | `media_id` inside section blocks + `seo.ogImageId` |
| **homepage_sections** | ordered composable sections (hero, featured, editorial, grid) | `media_id` per section |
| **navigation** | header/footer/mega-menu link tree (label, href, order, visibility) | optional `media_id` (menu imagery) · may link to `cms_pages.slug` |
| **email_templates** | key, subject, block content | `media_id` (logo/hero) · shares SEO/brand tokens |
| **seo** | per-page canonical/meta/OG/JSON-LD/robots | `media_id` (OG image) — or folded into `cms_pages.seo` |
| **redirects** | from_path → to_path, code, hit count | may target a `cms_pages.slug` |

`cms_pages.seo` already exists (slice 1), so **SEO is a field-set, not necessarily a
separate table** — a dedicated `seo` table is only needed for pages that aren't
`cms_pages` (e.g. product/collection routes).

## Media usage tracking (R4) — built into slice 2, not retrofitted

Because every consumer references `media_id`, "where is this asset used?" is a
**reverse lookup**, computed — never a stored counter that can drift:

```
usageOf(mediaId) =
    cms_pages         where sections/seo mention media_id
  ⋃ homepage_sections where media_id = $1
  ⋃ navigation        where media_id = $1
  ⋃ email_templates   where media_id = $1
  ⋃ variants/products where a gallery entry = media_id
```

Delete is **blocked when `usageOf(id)` is non-empty** (or offered as "replace across
N places"). Same principle as the rest of the OS: **derive from the source of truth,
don't cache a count that lies.**

## Read/write data flow

**Write (admin):** editor uploads → one `media` row (Supabase Storage path). Page/
homepage/nav/email editors pick from the Media Library and store the chosen
`media_id`. Saving a page snapshots a revision (`cms_page_revisions`, R3).

**Read (storefront):** server component calls the content service (`getPage`,
future `getHomepage`, `getNavigation`) → the service resolves `media_id → media`
row → emits a ready URL + alt + dimensions to the component. Scheduling
(`isPageLive`, R7) is evaluated at read time. Components receive resolved assets;
they never see a `media_id` or hit Storage directly.

**Cache:** storefront content pages are `force-dynamic` today (so schedule/edits
apply instantly). If we add ISR later, `media` replacement must trigger
revalidation of pages whose `media_id` matches — another reason the reference
must be an id, not a copied URL.

## Slice order (R9, adopted)

1. **Pages** ✅ (`cms_pages` + editor + storefront fallback)
2. **Media Library** ← next — establishes `media` + usage tracking; every later slice depends on it
3. **Navigation** (header/footer/mega-menu → DB)
4. **Homepage Builder** (composable sections; uses the Media picker)
5. **Email Templates** (subject/blocks → DB; uses Media for logo/hero)
6. **SEO Manager** (per-page; mostly `cms_pages.seo` already) · **Redirects** (301/302 + 404 log)

## Invariants for every future slice (checklist)

- [ ] Assets referenced by `media_id`. **No URL columns** outside `media`.
- [ ] New content type = new table with its own `status`/schedule if user-facing; reuse `isPageLive` semantics.
- [ ] Mutations write an audit event (`logEvent`) and, where editable prose, a revision snapshot.
- [ ] Storefront reads go through a content **service** that resolves media + schedule; components stay asset-shape-only.
- [ ] Deleting an asset consults `usageOf()` first.
