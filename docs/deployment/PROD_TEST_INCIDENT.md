# Production Test Incident — Findings, Footer Restore & Cleanup Plan

`npm test` was run while `.env.local` pointed at the **hosted** project, so ~8 integration suites executed
against production (this pattern **predates the current session** — see dates below — and is now blocked by
`src/test/integration-guard.ts`). All queries below were **read-only `SELECT`s already run** (authorized).
**No production data was modified.** The `INSERT`/`DELETE` statements are **prepared, NOT executed** — each
awaits your separate approval.

## Content integrity — read-only audit
| Area | Finding |
|---|---|
| Products | **10 active, intact**; no synthetic residue (`seo-it-*` fixtures cleaned) |
| Product imagery | **Real Cloudinary photos verified** (`res.cloudinary.com/l3xwxqah/samorah/products/*`, sampled URLs return **HTTP 200**; 18 refs across the 10 products); `product_images` holds gradient fallbacks by design |
| Supabase Storage | **No buckets in use** → catalogue imagery is Cloudinary-hosted, so the "Storage objects aren't in DB backups" concern does **not** apply here (Cloudinary is the durable image store) |
| Chapters/stories, CMS pages | 6 collections + 5 `cms_pages` intact (our-story, craft-materials, product-care, the-people-behind-samorah, faq) |
| `/about`, `/journal` SEO | **No live `seo_overrides`** — test's transient override removed; pages use defaults |
| Email templates | `order.confirmed` intact (2026-08-05); `order.cancelled` was always code-default |
| Header nav | Intact | 
| **Schema drift** | **Clean** — hosted vs local PostgREST schema (98 vs 99 tables) differs **only** by the pending `cron_locks` table + `notification_log.claimed_at`/`delivered_recipients` columns (the 4 pending migrations). No unexpected table/column drift. (Functions/RLS not shown by this surface — confirm via `supabase migration list` + the grant query below.) |

> **Honest scope:** this establishes **record presence, structure, image-URL validity, and table/column
> parity** — not a field-by-field value comparison against a known-good snapshot. The hosted Supabase Pro
> DB remains the source of truth for products and editorial content.

## 1. Footer — the one confirmed content loss (restore prepared, NOT executed)
The `navigation_menus` **`footer`** row was deleted by the nav test. **Content is recoverable** — the latest
of 3 `cms_revisions` footer snapshots (**2026-10-12**, pre-dates testing) holds the genuine footer:
**Shop · Chapters (Vol. I–IV) · About · Help · Follow** (confirmed matches the intended structure). Revisions
are kept intact; the restore sources content **directly from the revision** and cannot overwrite a newer row.

**Assertion-guarded** (no unconditional commit — any failed check RAISEs, which aborts the transaction so
the trailing `commit` becomes a ROLLBACK). Validated on local against synthetic revisions: commits on a
good 5-section revision; auto-rolls-back on footer-already-exists and on wrong-section-count.
```sql
begin;
do $$
declare v_rev public.cms_revisions; v_sections int; v_titles text[];
begin
  -- (8) never overwrite an existing legitimate footer
  if exists (select 1 from public.navigation_menus where id = 'footer') then
    raise exception 'ABORT: a navigation_menus footer row already exists — not overwriting.';
  end if;
  -- (1,2) load + validate the revision snapshot
  select * into v_rev from public.cms_revisions
    where id = '4c3db3e7-b144-4389-9d5d-e95dff0e9a07' and resource_key = 'footer';
  if not found then raise exception 'ABORT: footer revision 4c3db3e7… not found.'; end if;
  if jsonb_typeof(v_rev.snapshot) <> 'array' then raise exception 'ABORT: snapshot is not a JSON array.'; end if;
  -- (3) exactly the five expected sections, each with a non-empty links array
  v_sections := jsonb_array_length(v_rev.snapshot);
  if v_sections <> 5 then raise exception 'ABORT: expected 5 sections, found %.', v_sections; end if;
  select array_agg(e->>'title' order by ord) into v_titles
    from jsonb_array_elements(v_rev.snapshot) with ordinality as t(e, ord);
  if v_titles <> array['Shop','Chapters','About','Help','Follow'] then
    raise exception 'ABORT: section titles mismatch: %', v_titles;
  end if;
  if exists (select 1 from jsonb_array_elements(v_rev.snapshot) s
             where jsonb_typeof(s->'links') <> 'array' or jsonb_array_length(s->'links') = 0) then
    raise exception 'ABORT: a footer section has no links.';
  end if;
  -- (5) idempotent insert (guarded above; ON CONFLICT DO NOTHING is belt-and-suspenders)
  insert into public.navigation_menus (id, status, draft, published, published_revision_id, updated_at)
    values ('footer', 'published', v_rev.snapshot, v_rev.snapshot, v_rev.id, now())
    on conflict (id) do nothing;
  -- (7) verify the inserted row exactly (revision id, status, structure, content)
  perform 1 from public.navigation_menus
    where id = 'footer' and status = 'published'
      and published_revision_id = '4c3db3e7-b144-4389-9d5d-e95dff0e9a07'
      and jsonb_array_length(published) = 5 and published = v_rev.snapshot;
  if not found then raise exception 'ABORT: post-insert verification failed.'; end if;
  raise notice 'OK: footer restored from revision 4c3db3e7… (5 sections).';
end $$;
commit;   -- if any assertion raised above, the txn is aborted → this COMMIT is applied as ROLLBACK
```

**Post-restoration verification query (run separately after commit):**
```sql
select id, status, published_revision_id, jsonb_array_length(published) as sections,
       (select array_agg(e->>'title' order by ord)
          from jsonb_array_elements(published) with ordinality t(e, ord)) as section_titles
from public.navigation_menus where id = 'footer';
-- expect: footer | published | 4c3db3e7-… | 5 | {Shop,Chapters,About,Help,Follow}
```
First **check the live footer**: if it falls back to the code-config default and that's acceptable, restore
may be optional. This is CONTENT — restore, never remove.

## 2. Audit-log residue — EVIDENCE FIRST, deletion deferred
`audit_events` are the only residue (log rows, not content). **Preserve as incident evidence**; the
`DELETE`s below are prepared but should run only after you've retained the evidence and approved the scope.
Residue **dates from 2026-08-05 → 2026-10-16** (so it accrued across many prior test-against-hosted runs,
not only this session).

**Filter-safety verified read-only:**
- `notes like '/seo-it%'` ≈ **926** — **all** `seo.*`/`redirect.*` events (0 others); `/seo-it` is a pure test prefix (no real route). **Safe.**
- `notes like 'order.cancelled%'` ≈ **1418** — **all** `email_template.*` events (0 order-level rows); there is no real `order.cancelled` template. **Safe.**
- `notes like '%mw-unsafe%'` = **3** — the `/mw-unsafe` middleware test. **Safe.**
- `event like 'seo.%' and notes in ('/about','/journal')` — ⚠️ **do NOT blanket-delete.** These touch **real routes**; a legitimate historic SEO edit to `/about`/`/journal` would also match. If cleaning, scope to the test's instant create→delete pairs or leave them.

```sql
-- Run counts first; retain an export of these rows as evidence before deleting anything.
select count(*) from audit_events where notes like '/seo-it%';            -- ~926 (all seo.*/redirect.*)
select count(*) from audit_events where notes like 'order.cancelled%';    -- ~1418 (all email_template.*)
select count(*) from audit_events where notes like '%mw-unsafe%';         -- 3
-- Unambiguous test residue only (NOT the /about,/journal filter):
delete from audit_events where notes like '/seo-it%';
delete from audit_events where notes like 'order.cancelled%';
delete from audit_events where notes like '%mw-unsafe%';
```

## Why it can't recur
`integration-guard.ts` fails closed on any non-local Supabase URL (proven); `seed-test-coupons.mjs` is now
**LOCAL-ONLY with no hosted override** (refuses any non-local target); `npm run test:integration` fails
loudly without a local DB.
