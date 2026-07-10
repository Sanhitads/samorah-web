-- Email body authoring — structured blocks (review point 2). The email BODY becomes
-- an ordered list of typed blocks (heading / paragraph / button / note / divider /
-- details-placeholder), edited via the SAME schema engine as the Homepage — never
-- freeform HTML. Rendered to inline-styled email HTML on send. Opt-in per template:
-- with no blocks, the hardcoded builder is used unchanged (no regression).

alter table public.email_templates add column if not exists blocks  jsonb;
alter table public.email_templates add column if not exists eyebrow text;
alter table public.email_templates add column if not exists heading text;
