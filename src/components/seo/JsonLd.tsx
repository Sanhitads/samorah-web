/**
 * JSON-LD emitter (Phase 7 · point 31) — renders a structured-data object as a
 * <script type="application/ld+json"> tag. Server component; renders nothing for empty/nullish data.
 */
export function JsonLd({ data }: { data: unknown }) {
  if (!data || (typeof data === "object" && !Array.isArray(data) && Object.keys(data as object).length === 0)) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
