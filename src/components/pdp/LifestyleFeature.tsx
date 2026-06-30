import { AssetImage } from "@/components/ui/AssetImage";
import type { SectionComponentProps } from "@/components/sections/registry";
import type { LifestyleFeatureSettings } from "@/lib/productEditorial";

/**
 * LifestyleFeature (block) — an image beside where / when / pairs-with rows.
 * Reusable; self-hides until structured lifestyle data exists for a product.
 */
export function LifestyleFeature({ settings }: SectionComponentProps) {
  const s = settings as unknown as LifestyleFeatureSettings;
  if (!s.rows?.length) return null;

  return (
    <div className="lifestyle" data-align={s.align}>
      {s.media?.src ? (
        <div className="lifestyle__media">
          <AssetImage asset={s.media.src} alt={s.media.alt ?? ""} role="lifestyle" className="lifestyle__image" />
        </div>
      ) : null}
      <div className="lifestyle__body">
        {s.eyebrow ? <p className="lifestyle__eyebrow">{s.eyebrow}</p> : null}
        {s.heading ? <h2 className="lifestyle__heading">{s.heading}</h2> : null}
        <dl className="lifestyle__rows">
          {s.rows.map((r) => (
            <div key={r.label} className="lifestyle__row">
              <dt className="lifestyle__row-label">{r.label}</dt>
              <dd className="lifestyle__row-value">{r.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
