import type { SectionComponentProps } from "@/components/sections/registry";
import type { PoeticLinesSettings } from "@/lib/productEditorial";

/**
 * PoeticLines (block) — short lines read like verse, centred in whitespace. The
 * "Feels Like" beat. Reusable wherever a few lines should breathe.
 */
export function PoeticLines({ settings }: SectionComponentProps) {
  const s = settings as unknown as PoeticLinesSettings;
  if (!s.lines?.length) return null;

  return (
    <div className="poetic">
      {s.eyebrow ? <p className="poetic__eyebrow">{s.eyebrow}</p> : null}
      <div className="poetic__lines">
        {s.lines.map((line, i) => (
          <p key={i} className="poetic__line">{line}</p>
        ))}
      </div>
    </div>
  );
}
