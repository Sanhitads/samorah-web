-- Media credit + copyright (Phase 5 · point 25 — Media Improvements).
-- Adds per-asset attribution ("credit") and rights ("copyright") alongside the existing `photographer`
-- column, so the Media Library can record who made an image and its licensing. Both optional/nullable;
-- the media service reads/writes them resiliently, so uploads keep working before this migration runs.
alter table public.media add column if not exists credit text;
alter table public.media add column if not exists copyright text;

comment on column public.media.credit is 'Attribution / photographer credit shown or stored with the asset (Phase 5 #25).';
comment on column public.media.copyright is 'Copyright / licensing note for the asset (Phase 5 #25).';
