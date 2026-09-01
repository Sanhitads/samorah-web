"use client";

import type { MouseEvent } from "react";

/**
 * Focal-point picker — click anywhere on the image to mark the part that must stay in frame when
 * the photo is cropped to the PDP's aspect ratios. Stores a CSS object-position string ("50% 30%");
 * blank = centre. Mirrors the media-library focal control, kept lightweight for inline product use.
 */
function parse(pos: string | null | undefined): [number, number] {
  const m = (pos ?? "").match(/(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/);
  return m ? [Number(m[1]), Number(m[2])] : [50, 50];
}

export function FocalPicker({ url, value, onChange }: { url: string; value: string | null; onChange: (pos: string) => void }) {
  const [x, y] = parse(value);
  const set = (e: MouseEvent<HTMLImageElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const nx = Math.min(100, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * 100)));
    const ny = Math.min(100, Math.max(0, Math.round(((e.clientY - r.top) / r.height) * 100)));
    onChange(`${nx}% ${ny}%`);
  };
  return (
    <div className="pe-focal">
      <div className="pe-focal__stage">
        {/* eslint-disable-next-line @next/next/no-img-element -- admin focal picker, not a storefront image */}
        <img src={url} alt="" className="pe-focal__img" onClick={set} draggable={false} />
        <span className="pe-focal__dot" style={{ left: `${x}%`, top: `${y}%` }} aria-hidden="true" />
      </div>
      <div className="pe-focal__row">
        <span className="pe-focal__hint">Click to set focus · {x}% {y}%{value ? "" : " (centre)"}</span>
        {value ? <button type="button" className="pe-focal__reset" onClick={() => onChange("")}>Reset</button> : null}
      </div>
    </div>
  );
}
