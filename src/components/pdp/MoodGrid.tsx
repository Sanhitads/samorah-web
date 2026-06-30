import type { SectionComponentProps } from "@/components/sections/registry";
import type { MoodGridSettings } from "@/lib/productEditorial";

/**
 * MoodGrid (block) — the scent's character as editorial cards (Mood · Flame
 * Persona · Scent Group · Theme), not utilitarian tags. Reusable for any
 * product's character grid.
 */
export function MoodGrid({ settings }: SectionComponentProps) {
  const s = settings as unknown as MoodGridSettings;
  if (!s.cards?.length) return null;

  return (
    <div className="mood-grid">
      <div className="mood-grid__head">
        {s.eyebrow ? <p className="mood-grid__eyebrow">{s.eyebrow}</p> : null}
        {s.heading ? <h2 className="mood-grid__heading">{s.heading}</h2> : null}
      </div>
      <div className="mood-grid__cards">
        {s.cards.map((card) => (
          <div key={card.label} className="mood-card">
            <p className="mood-card__label">{card.label}</p>
            <p className="mood-card__value">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
