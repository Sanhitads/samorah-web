-- Air chapter CMS — one JSONB column on `collections` holding the editable air-chapter config:
-- the group headings/notes (The Room / The Linen), the next-volume teaser copy, the hero eyebrow,
-- and (later) custom colours. Additive + nullable; buildAirVolumeFromDb falls back to the house
-- defaults when a field is absent, so the chapter page keeps working before/after this is applied.
alter table public.collections add column if not exists air_chapter jsonb;

comment on column public.collections.air_chapter is
  'Air chapter CMS config: { heroEyebrow, room:{label,title,note}, linen:{label,title,note}, teaser:{closing,cta}, palette, customPalette:{surface,ink}, gradient }. All optional.';
