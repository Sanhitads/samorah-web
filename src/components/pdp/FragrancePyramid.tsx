import type { SectionComponentProps } from "@/components/sections/registry";
import type { FragrancePyramidSettings } from "@/lib/productEditorial";

/**
 * FragrancePyramid (block) — the Top / Heart / Base composition as an editorial
 * pyramid (not an accordion). The layers reveal in sequence via SectionShell.
 */
export function FragrancePyramid({ settings }: SectionComponentProps) {
  const s = settings as unknown as FragrancePyramidSettings;
  if (!s.layers?.length) return null;

  return (
    <div className="pyramid">
      <div className="pyramid__head">
        {s.eyebrow ? <p className="pyramid__eyebrow">{s.eyebrow}</p> : null}
        {s.heading ? <h2 className="pyramid__heading">{s.heading}</h2> : null}
        {s.intro ? <p className="pyramid__intro">{s.intro}</p> : null}
      </div>
      <div className="pyramid__layers">
        {s.layers.map((layer) => (
          <div key={layer.label} className="pyramid__layer">
            <p className="pyramid__layer-label">{layer.label}</p>
            <ul className="pyramid__notes">
              {layer.notes.map((n) => (
                <li key={n} className="pyramid__note">{n}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
