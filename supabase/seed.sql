-- ============================================================================
-- Samorah — LOCAL DEVELOPMENT SEED
-- ============================================================================
-- Runs automatically AFTER all migrations on `supabase db reset` and (first
-- boot) `supabase start`, because `[db.seed] enabled = true` in config.toml.
--
-- SAFETY
--   • This file ONLY ever runs against the LOCAL Docker Postgres (127.0.0.1:54322).
--     `supabase db reset` without `--linked` cannot touch the hosted project.
--   • Every row is SYNTHETIC. No real customer, email, phone, address, or payment
--     data appears here — emails use the reserved `@example.test` domain.
--   • Fixed UUIDs + ON CONFLICT guards make a reset deterministic and idempotent.
--
-- WHAT A RESET ALREADY GIVES YOU (from migrations, before this file runs):
--   • 4 categories (room/linen fresheners, wax tablets, reed diffusers)
--   • 1 site_settings singleton row
-- This seed ADDS a candle category, a chapter, sample products + variants,
-- fictional customers, an admin, and one example order so the storefront and
-- the admin both have something to render locally.
-- ============================================================================

begin;

-- ── 1. Candle category ──────────────────────────────────────────────────────
-- Migrations seed the air/wax/diffuser categories but not candles (the house
-- core), so add it here. Fixed id lets products below reference it directly.
insert into categories (id, name, slug, description, sku_prefix, default_hsn_code, default_gst_rate, sort_order, is_active)
values ('c0100000-0000-4000-8000-000000000001', 'Signature Candles', 'signature-candles',
        'Hand-poured scented candles — the house core.', 'SAM-CAN', '34060000', 12, 0, true)
on conflict (slug) do nothing;

-- ── 2. One editorial collection ("chapter") ─────────────────────────────────
insert into collections (id, name, slug, volume, tagline, description, is_active, sort_order)
values ('c0110000-0000-4000-8000-000000000001', 'Chapter One — First Light', 'first-light',
        'VOL. I', 'The opening chapter.',
        'A synthetic sample chapter for local development.', true, 0)
on conflict (slug) do nothing;

-- ── 3. Sample products (ACTIVE so the storefront lists them) ─────────────────
-- status='active' is what createPublicClient()/RLS exposes to the storefront.
insert into products (id, name, slug, base_sku, category_id, collection_id, tagline,
                      scent_group, fragrance_family, mood_tags, story, price, sale_price,
                      hsn_code, gst_rate, status, is_featured, is_bestseller, visible_website,
                      visible_search, visible_homepage, display_order, product_type)
values
  ('a0100000-0000-4000-8000-000000000001', 'Whispered Flame', 'whispered-flame', 'SAM-CAN-WF',
   'c0100000-0000-4000-8000-000000000001', 'c0110000-0000-4000-8000-000000000001',
   'For nights you want to stretch a little longer.',
   'Warm', 'Amber & Floral', '{"evening","warm","romantic"}',
   'Jasmine and rose settle into amber and a trace of leather.', 2450, null,
   '34060000', 12, 'active', true, true, true, true, true, 1, 'candle'),

  ('a0100000-0000-4000-8000-000000000002', 'Monsoon Letter', 'monsoon-letter', 'SAM-CAN-ML',
   'c0100000-0000-4000-8000-000000000001', 'c0110000-0000-4000-8000-000000000001',
   'Petrichor, paper, and the hour before rain.',
   'Fresh', 'Green & Earthy', '{"fresh","calm","rain"}',
   'Wet earth and vetiver under a cool sheet of green.', 2250, 1999,
   '34060000', 12, 'active', true, false, true, true, true, 2, 'candle'),

  ('a0100000-0000-4000-8000-000000000003', 'Saffron Dusk', 'saffron-dusk', 'SAM-CAN-SD',
   'c0100000-0000-4000-8000-000000000001', 'c0110000-0000-4000-8000-000000000001',
   'Spice and gold at the close of the day.',
   'Spiced', 'Oriental & Spice', '{"spiced","festive","warm"}',
   'Saffron and cardamom over sandalwood and a thread of honey.', 2650, null,
   '34060000', 12, 'active', false, false, true, true, true, 3, 'candle'),

  ('a0100000-0000-4000-8000-000000000004', 'Quiet Library', 'quiet-library', 'SAM-CAN-QL',
   'c0100000-0000-4000-8000-000000000001', 'c0110000-0000-4000-8000-000000000001',
   'Old books, cedar shelves, afternoon light.',
   'Woody', 'Woods', '{"woody","focus","calm"}',
   'Cedar and dry paper with a soft resinous base.', 2350, null,
   '34060000', 12, 'active', false, false, true, true, false, 4, 'candle')
on conflict (slug) do nothing;

-- ── 4. Variants (two sizes per product; in stock so checkout works) ──────────
insert into variants (id, product_id, sku, variant_name, vessel_type, size_label, price, sale_price, stock, weight_grams, is_active, sort_order)
values
  ('b0100000-0000-4000-8000-000000000001', 'a0100000-0000-4000-8000-000000000001', 'SAM-CAN-WF-200G', '200g',  'glass',   '200g', 2450, null, 40, 200, true, 0),
  ('b0100000-0000-4000-8000-000000000002', 'a0100000-0000-4000-8000-000000000001', 'SAM-CAN-WF-120G', '120g',  'ceramic', '120g', 1650, null, 25, 120, true, 1),
  ('b0100000-0000-4000-8000-000000000003', 'a0100000-0000-4000-8000-000000000002', 'SAM-CAN-ML-200G', '200g',  'glass',   '200g', 2250, 1999, 30, 200, true, 0),
  ('b0100000-0000-4000-8000-000000000004', 'a0100000-0000-4000-8000-000000000002', 'SAM-CAN-ML-120G', '120g',  'ceramic', '120g', 1550, 1399, 18, 120, true, 1),
  ('b0100000-0000-4000-8000-000000000005', 'a0100000-0000-4000-8000-000000000003', 'SAM-CAN-SD-200G', '200g',  'glass',   '200g', 2650, null, 22, 200, true, 0),
  ('b0100000-0000-4000-8000-000000000006', 'a0100000-0000-4000-8000-000000000003', 'SAM-CAN-SD-120G', '120g',  'ceramic', '120g', 1750, null, 15, 120, true, 1),
  ('b0100000-0000-4000-8000-000000000007', 'a0100000-0000-4000-8000-000000000004', 'SAM-CAN-QL-200G', '200g',  'glass',   '200g', 2350, null,  8, 200, true, 0),
  ('b0100000-0000-4000-8000-000000000008', 'a0100000-0000-4000-8000-000000000004', 'SAM-CAN-QL-120G', '120g',  'ceramic', '120g', 1500, null,  4, 120, true, 1)  -- below low_stock_threshold on purpose (exercises low-stock UI)
on conflict (sku) do nothing;

-- ── 5. Fictional people ──────────────────────────────────────────────────────
-- public.users.id is an FK to auth.users.id, and an AFTER INSERT trigger
-- (handle_new_user) copies new auth users into public.users. So we seed
-- auth.users (the real identity table) and then UPDATE the auto-created
-- public.users row for the app-specific fields (role, loyalty, consent …).
--
-- All three can sign in locally with password "devpassword" (or via the magic
-- link captured in Mailpit at http://127.0.0.1:54324). One admin reaches /admin;
-- two customers carry orders.
-- NOTE: the empty-string token columns (confirmation_token, recovery_token,
-- email_change_token_new, email_change) are REQUIRED. GoTrue scans them into
-- non-nullable Go strings when looking up a user at sign-in; leaving them NULL
-- makes every password/magic-link login fail with "Database error querying
-- schema" (converting NULL to string is unsupported). `phone` stays NULL on
-- purpose (GoTrue treats it as nullable, and '' can collide on its uniqueness).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', 'e0100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'dev-admin@example.test',   crypt('devpassword', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Dev Admin"}'::jsonb,   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e0100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'ananya.rao@example.test',  crypt('devpassword', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Ananya Rao"}'::jsonb,  '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e0100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'kabir.menon@example.test', crypt('devpassword', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Kabir Menon"}'::jsonb, '', '', '', '')
on conflict (id) do nothing;

update public.users set role='admin',    loyalty_points=0,   loyalty_tier='bronze', marketing_consent=false, email_verified=true, provider='email',  onboarded=true where id='e0100000-0000-4000-8000-000000000001';
update public.users set role='customer', loyalty_points=120, loyalty_tier='silver', marketing_consent=true,  email_verified=true, provider='email',  onboarded=true where id='e0100000-0000-4000-8000-000000000002';
update public.users set role='customer', loyalty_points=0,   loyalty_tier='bronze', marketing_consent=false, email_verified=true, provider='google', onboarded=true where id='e0100000-0000-4000-8000-000000000003';

-- ── 6. One example order with a line item (synthetic) ────────────────────────
-- orders requires only order_number + email; the rest default. Kept minimal and
-- clearly fake so order views / admin lists have something to show.
insert into orders (id, order_number, email, user_id, created_at)
values ('f0100000-0000-4000-8000-000000000001', 'SAM-DEV-0001', 'ananya.rao@example.test',
        'e0100000-0000-4000-8000-000000000002', now() - interval '3 days')
on conflict (id) do nothing;

insert into order_items (order_id, product_id, variant_id, product_name, sku, hsn_code, gst_rate, unit_price, quantity, line_subtotal, line_total)
values ('f0100000-0000-4000-8000-000000000001', 'a0100000-0000-4000-8000-000000000001',
        'b0100000-0000-4000-8000-000000000001', 'Whispered Flame', 'SAM-CAN-WF-200G',
        '34060000', 12, 2450, 1, 2450, 2744)  -- 2450 + 12% GST
on conflict do nothing;

commit;

-- ── Notes ────────────────────────────────────────────────────────────────────
-- • To add/adjust sample data, edit this file then run `npx supabase db reset`.
-- • Keep everything synthetic. If you ever need to reproduce a production bug,
--   write a fresh synthetic case here — never paste real customer rows.
