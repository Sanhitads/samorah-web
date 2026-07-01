"use client";

import { useState, type KeyboardEvent } from "react";
import { AssetImage } from "@/components/ui/AssetImage";
import type { ProductGalleryImage } from "@/lib/productPage";

/**
 * ProductGallery (client) — vertical thumbnails beside a main image that
 * cross-fades on selection, with a subtle hover zoom (desktop). Arrow keys move
 * between images. A single image renders without thumbnails. A full-screen
 * lightbox is a later addition (waits on real photography). Sticky purchase is
 * preserved by the surrounding layout.
 */
export function ProductGallery({ images, name }: { images: ProductGalleryImage[]; name: string }) {
  const imgs = images.length ? images : [];
  const [active, setActive] = useState(0);
  const count = imgs.length;

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (count < 2) return;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      setActive((i) => (i + 1) % count);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      setActive((i) => (i - 1 + count) % count);
    }
  };

  return (
    <div className="pdp__gallery" data-count={count} onKeyDown={onKey}>
      {count > 1 ? (
        <div className="pdp__thumbs" role="tablist" aria-label={`${name} images`}>
          {imgs.map((g, i) => (
            <button
              key={i}
              type="button"
              className="pdp__thumb"
              data-active={i === active}
              role="tab"
              aria-selected={i === active}
              aria-label={`View image ${i + 1}`}
              onClick={() => setActive(i)}
            >
              <AssetImage asset={g.src} alt={g.alt} role="detail" className="pdp__thumb-fill" />
            </button>
          ))}
        </div>
      ) : null}

      <div className="pdp__image" tabIndex={count > 1 ? 0 : -1} aria-roledescription="carousel">
        {imgs.map((g, i) => (
          <div key={i} className="pdp__image-layer" data-active={i === active} aria-hidden={i !== active}>
            <AssetImage
              asset={g.src}
              alt={i === active ? g.alt : ""}
              role="detail"
              priority={i === 0}
              className="pdp__image-fill"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
