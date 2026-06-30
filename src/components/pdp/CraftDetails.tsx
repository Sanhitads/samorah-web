import type { SectionComponentProps } from "@/components/sections/registry";
import type { CraftDetailsSettings } from "@/lib/productEditorial";

/**
 * CraftDetails (block) — how it's made, as a minimal editorial list (Hand
 * Poured → Wax → Wick → Burn Time → Vessel). Reusable for any product's craft.
 */
export function CraftDetails({ settings }: SectionComponentProps) {
  const s = settings as unknown as CraftDetailsSettings;
  if (!s.items?.length) return null;

  return (
    <div className="craft">
      <div className="craft__head">
        {s.eyebrow ? <p className="craft__eyebrow">{s.eyebrow}</p> : null}
        {s.heading ? <h2 className="craft__heading">{s.heading}</h2> : null}
      </div>
      <ul className="craft__items">
        {s.items.map((item) => (
          <li key={item.label} className="craft__item">
            <p className="craft__label">{item.label}</p>
            <p className="craft__value">{item.value}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
