-- Store a tiny LQIP (low-quality image placeholder) data URI per media asset, generated at upload time
-- from a heavily-blurred 20px Cloudinary derivative. Renderers can paint it instantly under the real
-- image (blur-up, no layout shift) with zero extra requests. Additive; null for pre-existing / external
-- assets. dominant_color + aspect_ratio already exist on the table (now populated at upload too).
alter table public.media add column if not exists blur_data_url text;
comment on column public.media.blur_data_url is 'Base64 LQIP (~<3KB data URI) for blur-up. Null for assets uploaded before this, or pasted external URLs.';
