"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Maximize2, X, ChevronLeft, ChevronRight } from "lucide-react";
import { AssetImage } from "@/components/ui/AssetImage";
import { trackGalleryImageView, trackGalleryFullscreen } from "@/lib/analytics/events";
import type { ProductGalleryImage } from "@/lib/productPage";

/**
 * ProductGallery (client) — vertical thumbnails beside a main image that
 * cross-fades on selection, with a subtle hover zoom (desktop) and a full-screen
 * lightbox (click the expand control or the image). Arrow keys move between
 * images; Escape closes the lightbox; body scroll locks while open. A single
 * image renders without thumbnails; thumbnails appear once a product has 2+.
 */
export function ProductGallery({ images, name, itemId }: { images: ProductGalleryImage[]; name: string; itemId?: string }) {
  const imgs = images.length ? images : [];
  const count = imgs.length;
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  // Gallery engagement (review point 5) — luxury buyers look carefully. Fire image_change
  // (skip the initial render) and fullscreen. Zoom is a CSS hover; fullscreen is the signal.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    if (itemId) trackGalleryImageView(itemId, active);
  }, [active, itemId]);
  useEffect(() => {
    if (open && itemId) trackGalleryFullscreen(itemId);
  }, [open, itemId]);

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

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      else if (e.key === "ArrowRight") setActive((i) => (i + 1) % count);
      else if (e.key === "ArrowLeft") setActive((i) => (i - 1 + count) % count);
    };
    document.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, count]);

  const current = imgs[active];

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
              <AssetImage asset={g.src} alt={g.alt} role="detail" sizes="96px" className="pdp__thumb-fill" />
            </button>
          ))}
        </div>
      ) : null}

      <div className="pdp__image" tabIndex={count > 1 ? 0 : -1} aria-roledescription="carousel">
        {imgs.map((g, i) => (
          <div key={i} className="pdp__image-layer" data-active={i === active} aria-hidden={i !== active}>
            <AssetImage asset={g.src} alt={i === active ? g.alt : ""} role="detail" priority={i === 0} sizes="(max-width: 900px) 100vw, 46vw" className="pdp__image-fill" />
          </div>
        ))}
        <button type="button" className="pdp__zoom" onClick={() => setOpen(true)} aria-label="View full screen">
          <Maximize2 size={17} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>

      {open && current ? (
        <div
          className="pdp__lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${name} — full screen`}
          onClick={() => setOpen(false)}
        >
          <button type="button" className="pdp__lightbox-close" onClick={() => setOpen(false)} aria-label="Close">
            <X size={22} strokeWidth={1.25} aria-hidden="true" />
          </button>
          {count > 1 ? (
            <button
              type="button"
              className="pdp__lightbox-nav pdp__lightbox-nav--prev"
              onClick={(e) => { e.stopPropagation(); setActive((i) => (i - 1 + count) % count); }}
              aria-label="Previous image"
            >
              <ChevronLeft size={30} strokeWidth={1} aria-hidden="true" />
            </button>
          ) : null}
          <figure className="pdp__lightbox-img" onClick={(e) => e.stopPropagation()}>
            <AssetImage asset={current.src} alt={current.alt} role="detail" sizes="100vw" className="pdp__lightbox-fill" />
          </figure>
          {count > 1 ? (
            <button
              type="button"
              className="pdp__lightbox-nav pdp__lightbox-nav--next"
              onClick={(e) => { e.stopPropagation(); setActive((i) => (i + 1) % count); }}
              aria-label="Next image"
            >
              <ChevronRight size={30} strokeWidth={1} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
