import { ParallaxMedia } from "@/components/ui/ParallaxMedia";
import type { SectionComponentProps } from "@/components/sections/registry";
import type { ArtworkFeatureSettings } from "@/lib/productEditorial";

/**
 * ArtworkFeature (block, Layout B) — a full-width artwork, edge to edge, no
 * surrounding UI. A gallery pause in the narrative, like turning to a plate in
 * a coffee-table book. Reusable wherever an image deserves the whole page.
 */
export function ArtworkFeature({ settings }: SectionComponentProps) {
  const s = settings as unknown as ArtworkFeatureSettings;
  if (!s.media?.src) return null;

  return (
    <figure className="artwork">
      <div className="artwork__frame">
        <ParallaxMedia src={s.media.src} alt={s.media.alt ?? ""} role="architecture" imageClassName="artwork__image" range={28} />
      </div>
      {s.caption ? <figcaption className="artwork__caption">{s.caption}</figcaption> : null}
    </figure>
  );
}
