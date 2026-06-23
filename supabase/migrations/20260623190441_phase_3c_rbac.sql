-- ============================================================================
-- Phase 3C Step 2 — RBAC: role helpers + staff read/write policies
--
-- Database-enforced permissions (not service-role-only). Staff act through their
-- own authenticated session; RLS authorizes by role. The service role stays
-- reserved for webhooks / cron / email / background jobs.
--
-- Active role model: customer < editor < manager < admin. `super_admin` exists
-- in the enum (dormant); the enum's declaration order makes `>=` give the
-- hierarchy, so it sorts above admin and is never wrongly denied.
--
-- Tiers (BRD §6.3):
--   editor+  → content: blogs, homepage_banners, instagram_gallery (+ read reviews)
--   manager+ → commerce: categories, collections, products, variants,
--              product_images, fragrance_notes, coupons, related_products,
--              orders (read all + update)
--   admin+   → sensitive: users (read), settings, gift_cards, loyalty (insert),
--              wholesale, performance_audits, audit_logs (read), newsletter,
--              search_logs, stock_notifications. Role changes via set_user_role().
-- ============================================================================


-- ── Role helpers ───────────────────────────────────────────────────────────────
-- SECURITY DEFINER so it can read users.role without recursing through users RLS.
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

-- Hierarchy checks (rely on the enum's declaration order for >=).
create or replace function public.is_editor()
returns boolean language sql stable
as $$ select coalesce(public.current_user_role() >= 'editor'::public.user_role, false) $$;

create or replace function public.is_manager()
returns boolean language sql stable
as $$ select coalesce(public.current_user_role() >= 'manager'::public.user_role, false) $$;

create or replace function public.is_admin()
returns boolean language sql stable
as $$ select coalesce(public.current_user_role() >= 'admin'::public.user_role, false) $$;


-- ── Role management (admin-only, no service role) ──────────────────────────────
-- Self-gated: bypasses users column-grants/RLS via DEFINER, but only an admin
-- caller can actually change a role.
create or replace function public.set_user_role(
  target_user_id uuid,
  new_role public.user_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins may change user roles';
  end if;
  update public.users set role = new_role where id = target_user_id;
end;
$$;

revoke execute on function public.set_user_role(uuid, public.user_role) from public, anon;
grant  execute on function public.set_user_role(uuid, public.user_role) to authenticated;


-- ============================================================================
-- Staff READ policies (additive — OR'd with the existing public/owner policies)
-- ============================================================================
-- manager+ : process orders / coupons
create policy "orders staff read"        on public.orders              for select to authenticated using (public.is_manager());
create policy "order_items staff read"   on public.order_items         for select to authenticated using (public.is_manager());
create policy "coupons staff read"       on public.coupons             for select to authenticated using (public.is_manager());
-- editor+  : moderate/curate content (see drafts + pending reviews)
create policy "reviews staff read"       on public.reviews             for select to authenticated using (public.is_editor());
-- admin+   : sensitive data
create policy "users admin read"         on public.users              for select to authenticated using (public.is_admin());
create policy "settings admin read"      on public.settings           for select to authenticated using (public.is_admin());
create policy "audit_logs admin read"    on public.audit_logs         for select to authenticated using (public.is_admin());
create policy "newsletter admin read"    on public.newsletter         for select to authenticated using (public.is_admin());
create policy "wholesale admin read"     on public.wholesale_customers for select to authenticated using (public.is_admin());
create policy "search_logs admin read"   on public.search_logs        for select to authenticated using (public.is_admin());
create policy "stock_notif admin read"   on public.stock_notifications for select to authenticated using (public.is_admin());
create policy "loyalty admin read"       on public.loyalty_transactions for select to authenticated using (public.is_admin());


-- ============================================================================
-- Staff WRITE policies
-- ============================================================================
-- editor+ : content (full management; also covers reading drafts/inactive)
create policy "blogs editor write"   on public.blogs             for all to authenticated using (public.is_editor()) with check (public.is_editor());
create policy "banners editor write" on public.homepage_banners  for all to authenticated using (public.is_editor()) with check (public.is_editor());
create policy "gallery editor write" on public.instagram_gallery for all to authenticated using (public.is_editor()) with check (public.is_editor());

-- manager+ : commerce catalog (full management; covers reading inactive/drafts)
create policy "categories manager write"     on public.categories      for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "collections manager write"    on public.collections     for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "products manager write"       on public.products        for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "variants manager write"       on public.variants        for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "product_images manager write" on public.product_images  for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "fragrance_notes manager write" on public.fragrance_notes for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "coupons manager write"        on public.coupons         for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "related_products manager write" on public.related_products for all to authenticated using (public.is_manager()) with check (public.is_manager());
-- orders: manager+ may UPDATE (process / NDR). Refund-specific authorization
-- (payment_status -> refunded = admin) is enforced in the server action layer.
create policy "orders manager update" on public.orders for update to authenticated using (public.is_manager()) with check (public.is_manager());

-- admin+ : sensitive
create policy "gift_cards admin write"   on public.gift_cards          for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "perf admin write"         on public.performance_audits  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "loyalty admin insert"     on public.loyalty_transactions for insert to authenticated with check (public.is_admin());
create policy "settings admin update"    on public.settings            for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "wholesale admin update"   on public.wholesale_customers  for update to authenticated using (public.is_admin()) with check (public.is_admin());


-- ============================================================================
-- Grants — authenticated gets the table privileges; the policies above gate them.
-- (A customer holds the privilege but every staff policy evaluates false for them.)
-- ============================================================================
-- editor+ content
grant insert, update, delete on public.blogs             to authenticated;
grant insert, update, delete on public.homepage_banners  to authenticated;
grant insert, update, delete on public.instagram_gallery to authenticated;

-- manager+ commerce
grant insert, update, delete on public.categories        to authenticated;
grant insert, update, delete on public.collections       to authenticated;
grant insert, update, delete on public.products          to authenticated;
grant insert, update, delete on public.variants          to authenticated;
grant insert, update, delete on public.product_images    to authenticated;
grant insert, update, delete on public.fragrance_notes   to authenticated;
grant insert, update, delete on public.related_products  to authenticated;
grant select, insert, update, delete on public.coupons   to authenticated;
grant update on public.orders                            to authenticated;

-- admin+ sensitive
grant select, insert, update, delete on public.gift_cards         to authenticated;
grant select, insert, update, delete on public.performance_audits to authenticated;
grant insert on public.loyalty_transactions               to authenticated;
grant select, update on public.settings                   to authenticated;
grant select, update on public.wholesale_customers        to authenticated;
grant select on public.audit_logs                         to authenticated;
grant select on public.search_logs                        to authenticated;
grant select on public.newsletter                         to authenticated;
grant select on public.stock_notifications                to authenticated;
