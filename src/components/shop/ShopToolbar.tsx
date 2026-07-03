"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X, ChevronDown } from "lucide-react";
import { useOverlay } from "@/hooks/useOverlay";
import type { ShopFilterChoice, ShopSort, ShopSortOption } from "@/lib/shopPage";

/** Build a /shop URL, dropping defaults — mirrors the server's href() so
 *  shareable, SSR, combined filtering all keep working. */
function shopHref(type: string, chapter: string, vessel: string, sort: ShopSort): string {
  const p = new URLSearchParams();
  if (type !== "all") p.set("type", type);
  if (chapter !== "all") p.set("chapter", chapter);
  if (vessel !== "all") p.set("vessel", vessel);
  if (sort !== "featured") p.set("sort", sort);
  const qs = p.toString();
  return qs ? `/shop?${qs}` : "/shop";
}

const vesselApplies = (type: string) => type === "all" || type === "candle";

export interface ShopToolbarProps {
  count: number;
  activeCount: number;
  activeType: string;
  activeChapter: string;
  activeVessel: string;
  activeSort: ShopSort;
  typeOptions: ShopFilterChoice[];
  chapterOptions: ShopFilterChoice[];
  vesselOptions: ShopFilterChoice[];
  sorts: ShopSortOption[];
}

/**
 * ShopToolbar (client) — the minimal filter presentation: a quiet "Refine" +
 * "Sort" toolbar over an SSR product grid. Refine opens a slide-out drawer that
 * composes the same URL the server reads (so SSR / shareable URLs / combined
 * filtering are untouched — this is presentation only). Editorial, calm.
 */
export function ShopToolbar(props: ShopToolbarProps) {
  const { count, activeCount, sorts, activeSort } = props;
  const [refineOpen, setRefineOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const activeSortLabel = sorts.find((s) => s.key === activeSort)?.label ?? "Featured";

  return (
    <div className="shop-toolbar">
      <p className="shop-toolbar__count">{count} {count === 1 ? "Product" : "Products"}</p>

      <div className="shop-toolbar__bar">
        <button type="button" className="shop-toolbar__refine" onClick={() => setRefineOpen(true)}>
          Refine{activeCount > 0 ? <span className="shop-toolbar__badge"> ({activeCount})</span> : null}
        </button>

        <div className="shop-sort" onMouseLeave={() => setSortOpen(false)}>
          <button
            type="button"
            className="shop-sort__button"
            aria-expanded={sortOpen}
            aria-haspopup="listbox"
            onClick={() => setSortOpen((v) => !v)}
          >
            <span className="shop-sort__label">Sort</span>
            <span className="shop-sort__current">{activeSortLabel}</span>
            <ChevronDown size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
          {sortOpen ? (
            <ul className="shop-sort__menu" role="listbox">
              {sorts.map((s) => (
                <li key={s.key} role="option" aria-selected={s.active}>
                  <a href={s.href} className="shop-sort__opt" data-active={s.active}>
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <AnimatePresence>
        {refineOpen ? <RefineDrawer {...props} onClose={() => setRefineOpen(false)} /> : null}
      </AnimatePresence>
    </div>
  );
}

const EASE = [0.25, 0.1, 0.25, 1] as const;

function RefineDrawer({
  activeType,
  activeChapter,
  activeVessel,
  activeSort,
  typeOptions,
  chapterOptions,
  vesselOptions,
  onClose,
}: ShopToolbarProps & { onClose: () => void }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const ref = useOverlay(true, onClose);

  const [type, setType] = useState(activeType);
  const [chapter, setChapter] = useState(activeChapter);
  const [vessel, setVessel] = useState(activeVessel);

  const showVessel = vesselApplies(type);

  const apply = () => {
    router.push(shopHref(type, chapter, showVessel ? vessel : "all", activeSort), { scroll: false });
    onClose();
  };
  const clearAll = () => {
    setType("all");
    setChapter("all");
    setVessel("all");
  };

  const scrim = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.25 } };
  const panel = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
    : { initial: { x: "100%" }, animate: { x: 0 }, exit: { x: "100%" }, transition: { duration: 0.4, ease: EASE } };

  const onScrim = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const Group = ({ label, options, value, onChange }: {
    label: string;
    options: ShopFilterChoice[];
    value: string;
    onChange: (v: string) => void;
  }) => (
    <fieldset className="refine-group">
      <legend className="refine-group__label">{label}</legend>
      <div className="refine-group__options">
        {options.map((o) => (
          <label key={o.key} className="refine-option" data-active={value === o.key}>
            <input
              type="radio"
              name={label}
              className="refine-option__input"
              checked={value === o.key}
              onChange={() => onChange(o.key)}
            />
            <span className="refine-option__mark" aria-hidden="true" />
            <span className="refine-option__label">{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <motion.div className="refine-overlay" role="dialog" aria-modal="true" aria-label="Refine" onClick={onScrim} {...scrim}>
      <motion.div className="refine-drawer" ref={ref} {...panel}>
        <div className="refine-drawer__head">
          <h2 className="refine-drawer__title">Refine</h2>
          <button type="button" className="refine-drawer__close" onClick={onClose} aria-label="Close">
            <X size={20} strokeWidth={1.25} aria-hidden="true" />
          </button>
        </div>

        <div className="refine-drawer__body">
          <Group label="Product Type" options={typeOptions} value={type} onChange={setType} />
          <Group label="Chapter" options={chapterOptions} value={chapter} onChange={setChapter} />
          {showVessel ? <Group label="Vessel" options={vesselOptions} value={vessel} onChange={setVessel} /> : null}
        </div>

        <div className="refine-drawer__footer">
          <button type="button" className="refine-drawer__clear" onClick={clearAll}>Clear All</button>
          <button type="button" className="refine-drawer__apply" onClick={apply}>Apply Filters</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
