"use client";

import { useState, useEffect, useRef } from "react";

/**
 * Small shared overflow (•••) menu primitive. Data-driven and narrow — the reusable version of the
 * inline coupon `cpn-menu` pattern, so admin tables get a compact primary action + an overflow of
 * lower-frequency/destructive actions without stacks of buttons. Outside-click + Escape close it.
 */
export interface KebabItem { label: string; onClick: () => void; danger?: boolean; sep?: boolean; disabled?: boolean }

export function KebabMenu({ items, label = "More actions" }: { items: KebabItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (!items.length) return null;
  return (
    <div className="kebab" ref={ref}>
      <button type="button" className="ff-btn ff-btn--sm kebab__trigger" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>•••</button>
      {open ? (
        <div className="kebab__menu" role="menu">
          {items.map((it, i) => (
            <button key={i} type="button" role="menuitem" disabled={it.disabled}
              className={`kebab__item${it.danger ? " kebab__item--danger" : ""}${it.sep ? " kebab__item--sep" : ""}`}
              onClick={() => { setOpen(false); it.onClick(); }}>{it.label}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
