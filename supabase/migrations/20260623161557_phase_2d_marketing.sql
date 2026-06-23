-- ============================================================================
-- Phase 2D — Marketing / community
--
-- Tables:  newsletter (standalone),  reviews (-> products/users/orders),
--          wishlists (-> users/products/variants)
--
-- RLS highlights:
--   • newsletter : anyone may SUBSCRIBE (insert); the list is not publicly readable.
--   • reviews    : public reads only APPROVED reviews; a customer may post one
--                  only for a product they have a DELIVERED order for (anti-fake-
--                  review), and only as 'pending'.
--   • wishlists  : strictly owner-only.
-- ============================================================================


-- ── Enums ────────────────────────────────────────────────────────────────────
create type public.review_status as enum ('pending', 'approved', 'rejected');


-- ── newsletter ─────────────────────────────────────────────────────────────────
create table public.newsletter (
  id              uuid primary key default gen_random_uuid(),
  email           varchar(255) not null unique,
  source          varchar(60),                                   -- homepage|product|checkout|footer|popup
  is_active       boolean not null default true,
  tags            text[] not null default '{}',                  -- segmentation
  subscribed_at   timestamptz not null default now(),
  unsubscribed_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);


-- ── reviews ─────────────────────────────────────────────────────────────────────
create table public.reviews (
  id                   uuid primary key default gen_random_uuid(),
  product_id           uuid not null references public.products(id) on delete cascade,
  user_id              uuid not null references public.users(id)    on delete cascade,
  order_id             uuid references public.orders(id) on delete set null,   -- soft link to the purchase
  rating               smallint not null check (rating between 1 and 5),
  title                varchar(100),
  comment              text not null check (char_length(comment) <= 2000),
  images               text[] not null default '{}',             -- Cloudinary URLs (app caps at 3)
  video_url            text,
  is_verified_purchase boolean not null default false,
  status               public.review_status not null default 'pending',
  helpful_count        integer not null default 0 check (helpful_count >= 0),
  admin_reply          text,
  replied_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (product_id, user_id)                                   -- one review per product per user
);

create index reviews_product_status_idx on public.reviews(product_id, status);
create index reviews_user_id_idx         on public.reviews(user_id);
create index reviews_status_idx          on public.reviews(status);


-- ── wishlists ───────────────────────────────────────────────────────────────────
create table public.wishlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id)    on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.variants(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- One wishlist entry per user/product/variant (treat NULL variant as a fixed key).
create unique index wishlists_unique_entry
  on public.wishlists(user_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index wishlists_user_id_idx on public.wishlists(user_id);


-- ── updated_at triggers ───────────────────────────────────────────────────────
create trigger trg_newsletter_updated_at before update on public.newsletter for each row execute function public.set_updated_at();
create trigger trg_reviews_updated_at     before update on public.reviews    for each row execute function public.set_updated_at();


-- ============================================================================
-- Row-Level Security
-- ============================================================================
alter table public.newsletter enable row level security;
alter table public.reviews    enable row level security;
alter table public.wishlists  enable row level security;

-- newsletter: anyone may subscribe; nobody (client) may read/modify the list.
create policy "newsletter subscribe"
  on public.newsletter for insert to anon, authenticated
  with check (true);

-- reviews: public read of approved; authenticated also read their own (any status).
create policy "reviews public read approved"
  on public.reviews for select to anon, authenticated
  using (status = 'approved');

create policy "reviews read own"
  on public.reviews for select to authenticated
  using (auth.uid() = user_id);

-- reviews: a customer may post a 'pending' review only for a product they have a
-- DELIVERED order for (anti-fake-review). product_id is matched against the set of
-- delivered-order product_ids (IN-form avoids column ambiguity with order_items).
create policy "reviews insert verified"
  on public.reviews for insert to authenticated
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and product_id in (
      select oi.product_id
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where o.user_id = auth.uid() and o.status = 'delivered'
    )
  );

-- reviews: a customer may edit their own review only while it is still pending.
create policy "reviews update own pending"
  on public.reviews for update to authenticated
  using (auth.uid() = user_id and status = 'pending')
  with check (auth.uid() = user_id and status = 'pending');

-- wishlists: owner-only.
create policy "wishlists select own"
  on public.wishlists for select to authenticated
  using (auth.uid() = user_id);

create policy "wishlists insert own"
  on public.wishlists for insert to authenticated
  with check (auth.uid() = user_id);

create policy "wishlists delete own"
  on public.wishlists for delete to authenticated
  using (auth.uid() = user_id);


-- ============================================================================
-- Grants (inline). RLS governs rows; column grants keep moderation fields safe.
-- ============================================================================

-- newsletter: subscribe only (no client read/update/delete).
grant insert on public.newsletter to anon, authenticated;
grant all    on public.newsletter to service_role;

-- reviews: public read; authenticated insert + edit own content columns only
-- (status / helpful_count / admin_reply / is_verified_purchase stay server-managed).
grant select on public.reviews to anon, authenticated;
grant insert on public.reviews to authenticated;
grant update (title, comment, images, video_url) on public.reviews to authenticated;
grant all    on public.reviews to service_role;

-- wishlists: owner CRUD (no update needed — entries are add/remove).
grant select, insert, delete on public.wishlists to authenticated;
grant all on public.wishlists to service_role;
