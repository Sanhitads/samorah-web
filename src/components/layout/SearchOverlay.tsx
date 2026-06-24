"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Search as SearchIcon, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useOverlay } from "@/hooks/useOverlay";
import { SEARCH_SUGGESTIONS, searchProducts } from "@/lib/search";

/**
 * Search Overlay (Phase 6 · Component 4).
 *
 * Isolated overlay — coordinated only via `open` / `onClose` (wired through the
 * UI store in StoreChrome). A dark blurred scrim with an ivory panel dropping
 * from the top: a large serif input, quick-search chips before typing, and live
 * catalogue results. Search is delegated to `searchProducts` (lib/search) so the
 * backend can move server-side later without touching this component.
 */
export interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
}

const EASE_OUT = [0, 0, 0.2, 1] as const;
const EASE_LUXURY = [0.25, 0.1, 0.25, 1] as const;

export function SearchOverlay({ open, onClose }: SearchOverlayProps) {
  const reduceMotion = useReducedMotion();
  const ref = useOverlay(open, onClose);
  const [query, setQuery] = useState("");

  // Clear the query whenever the overlay closes.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const results = useMemo(() => searchProducts(query), [query]);
  const hasQuery = query.trim().length > 0;

  const scrimMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.25, ease: EASE_OUT } };

  const panelMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
    : {
        initial: { opacity: 0, y: -12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -12 },
        transition: { duration: 0.3, ease: EASE_LUXURY },
      };

  const onScrim = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="search"
          ref={ref}
          className="search-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          onClick={onScrim}
          {...scrimMotion}
        >
          <motion.div className="search-overlay__panel" {...panelMotion}>
            <div className="search-overlay__input-row">
              <SearchIcon className="search-overlay__icon" size={20} strokeWidth={1.25} aria-hidden="true" />
              <input
                type="search"
                className="search-overlay__input"
                placeholder="Search fragrances, notes, moods…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search the catalogue"
                autoComplete="off"
              />
              {hasQuery && (
                <button
                  type="button"
                  className="search-overlay__clear"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                >
                  <X size={18} strokeWidth={1.25} aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                className="search-overlay__close-btn"
                onClick={onClose}
                aria-label="Close search"
              >
                <X size={20} strokeWidth={1.25} aria-hidden="true" />
              </button>
            </div>

            {!hasQuery ? (
              <div className="search-overlay__suggestions">
                <p className="search-overlay__section-label">Suggestions</p>
                <div className="search-overlay__chips">
                  {SEARCH_SUGGESTIONS.map((term) => (
                    <button
                      key={term}
                      type="button"
                      className="search-chip"
                      onClick={() => setQuery(term)}
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="search-overlay__results">
                {results.length > 0 ? (
                  <>
                    <p className="search-overlay__section-label">
                      {results.length} {results.length === 1 ? "result" : "results"}
                    </p>
                    <div className="search-overlay__all-products">
                      {results.map((r) => (
                        <Link
                          key={r.slug}
                          href={`/shop/${r.slug}`}
                          className="search-result-item"
                          onClick={onClose}
                        >
                          <span
                            className={`search-result-item__img ${r.gradClass}`}
                            aria-hidden="true"
                          />
                          <span className="search-result-item__body">
                            <span className="search-result-item__chapter">{r.chapterName}</span>
                            <span className="search-result-item__name">{r.name}</span>
                            <span className="search-result-item__notes">{r.notes}</span>
                            {r.tags.length > 0 && (
                              <span className="search-result-item__tags">
                                {r.tags.map((t) => (
                                  <span key={t} className="search-result-item__tag">
                                    {t}
                                  </span>
                                ))}
                              </span>
                            )}
                          </span>
                          <span className="search-result-item__price">
                            ₹{r.price.toLocaleString("en-IN")}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="search-overlay__empty">
                    <p className="search-overlay__empty-heading">Nothing here yet</p>
                    <p className="search-overlay__empty-sub">
                      Try a scent, a note, or a mood.
                    </p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
