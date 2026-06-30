import { AssetImage } from "@/components/ui/AssetImage";
import type { SectionComponentProps } from "@/components/sections/registry";
import type { ArtistFeatureSettings } from "@/lib/productEditorial";

/**
 * ArtistFeature (block, Layout A) — a process image on one side, the artist's
 * story on the other. Intimate. Reusable across any product that references an
 * artist. Followed in the sequence by ArtworkFeature + an EditorialQuote.
 */
export function ArtistFeature({ settings }: SectionComponentProps) {
  const s = settings as unknown as ArtistFeatureSettings;
  if (!s.story?.length) return null;

  return (
    <div className="artist" data-align={s.align}>
      <div className="artist__media">
        <AssetImage asset={s.media.src} alt={s.media.alt ?? s.name} role="portrait" className="artist__image" />
      </div>
      <div className="artist__body">
        {s.eyebrow ? <p className="artist__eyebrow">{s.eyebrow}</p> : null}
        <h2 className="artist__name">{s.name}</h2>
        {s.role ? <p className="artist__role">{s.role}</p> : null}
        {s.story.map((p, i) => (
          <p key={i} className="artist__para">{p}</p>
        ))}
      </div>
    </div>
  );
}
