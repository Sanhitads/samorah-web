-- Candle-chapter CMS extras (review: the chapter collection page — /chapters/[slug] — is the last
-- rich page without a visual CMS. Most of it is already editable via real collection columns; the
-- remaining per-chapter presentation bits — custom colour palette (incl. the accent/number colour),
-- hero gradient, renamed section headings + the three independent poetic lines (hero / intro / quote),
-- and admin-added custom sections — don't fit a fixed column each. One JSONB blob holds them, mirroring
-- air_chapter / pdp_content. Additive; air chapters use air_chapter instead.
alter table public.collections add column if not exists chapter_content jsonb;
comment on column public.collections.chapter_content is 'Candle-chapter CMS extras: { customPalette:{surface,ink,accent}, customGradient:{from,to,angle}, labels:{breadcrumb,heroPoeticLine,introLine,signatureEyebrow,restHeading,quoteLine,nextHeading}, customSections:[...] }. Null = house defaults.';
