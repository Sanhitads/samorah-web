import type { SectionComponentProps } from "@/components/sections/registry";
import type { EditorialQuoteSettings } from "@/lib/productEditorial";

/**
 * EditorialQuote (block) — one centred sentence in generous whitespace. A
 * `handwritten` variant for the artist's line, `hairline` for a quiet quote
 * moment. The page-turn beat. Reusable anywhere a sentence deserves the page.
 */
export function EditorialQuote({ settings }: SectionComponentProps) {
  const s = settings as unknown as EditorialQuoteSettings;
  if (!s.quote) return null;

  return (
    <figure className="equote" data-variant={s.variant}>
      <span className="equote__rule" aria-hidden="true" />
      <blockquote className="equote__quote">“{s.quote}”</blockquote>
      {s.attribution ? <figcaption className="equote__attr">{s.attribution}</figcaption> : null}
    </figure>
  );
}
