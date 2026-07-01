import type { SectionComponentProps } from "@/components/sections/registry";
import type { EditorialDividerSettings } from "@/lib/productEditorial";

/**
 * EditorialDivider (block) — a hairline, optionally holding one short line, that
 * separates movements (chapters · products · artist · lifestyle). A breathing
 * beat that makes the whole site read as one publication. Reusable everywhere.
 */
export function EditorialDivider({ settings }: SectionComponentProps) {
  const s = settings as unknown as EditorialDividerSettings;
  return (
    <div className="ediv" data-variant={s.line ? "line" : "rule"}>
      <span className="ediv__rule" aria-hidden="true" />
      {s.line ? <p className="ediv__line">{s.line}</p> : null}
      {s.line ? <span className="ediv__rule" aria-hidden="true" /> : null}
    </div>
  );
}
