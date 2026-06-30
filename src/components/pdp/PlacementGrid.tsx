import type { SectionComponentProps } from "@/components/sections/registry";
import type { PlacementGridSettings } from "@/lib/productEditorial";

/**
 * PlacementGrid (block) — where the fragrance belongs (bedroom · living ·
 * workspace), as quiet editorial tiles. Reusable for any product's placement.
 */
export function PlacementGrid({ settings }: SectionComponentProps) {
  const s = settings as unknown as PlacementGridSettings;
  if (!s.items?.length) return null;

  return (
    <div className="placement">
      <div className="placement__head">
        {s.eyebrow ? <p className="placement__eyebrow">{s.eyebrow}</p> : null}
        {s.heading ? <h2 className="placement__heading">{s.heading}</h2> : null}
      </div>
      <div className="placement__grid">
        {s.items.map((item) => (
          <div key={item.label} className="placement__item">
            <span className="placement__rule" aria-hidden="true" />
            <p className="placement__label">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
