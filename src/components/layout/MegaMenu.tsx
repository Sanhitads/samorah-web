"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_BRANCH_ID,
  MENU_BRANCHES,
  type MenuBranch,
} from "@/config/navigation";
import { useOverlay } from "@/hooks/useOverlay";

/**
 * Fullscreen Editorial Mega Menu (Phase 6 · Component 3).
 *
 * An editorial table of contents — not a dropdown. Independent overlay,
 * isolated from Search / Cart / Auth / Mobile Menu; coordinated only via the
 * `open` / `onClose` props (wired through the UI store in StoreChrome).
 *
 * LEFT  primary branches · CENTER dynamic links · RIGHT campaign (4:5).
 * SHOP is active by default — never an empty state. Coming-soon items render as
 * quiet, non-navigating labels (config `isComingSoon`).
 */
export interface MegaMenuProps {
  open: boolean;
  onClose: () => void;
}

const EASE_LUXURY = [0.25, 0.1, 0.25, 1] as const;
const EASE_OUT = [0, 0, 0.2, 1] as const;

export function MegaMenu({ open, onClose }: MegaMenuProps) {
  const reduceMotion = useReducedMotion();
  const [activeId, setActiveId] = useState<MenuBranch["id"]>(DEFAULT_BRANCH_ID);
  // Shared overlay behaviour: scroll lock · focus trap · ESC · return focus.
  const dialogRef = useOverlay(open, onClose);

  const active =
    MENU_BRANCHES.find((b) => b.id === activeId) ?? MENU_BRANCHES[0];

  // Open on SHOP — never an empty state.
  useEffect(() => {
    if (open) setActiveId(DEFAULT_BRANCH_ID);
  }, [open]);

  // Close when the negative space (overlay root) is clicked — not the content.
  const onBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const overlayMotion = reduceMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.2 },
      }
    : {
        initial: { opacity: 0, y: -12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -12 },
        transition: { duration: 0.5, ease: EASE_LUXURY },
      };

  const panelMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.15 } }
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.4, ease: EASE_OUT },
      };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="mega"
          ref={dialogRef}
          className="mega"
          role="dialog"
          aria-modal="true"
          aria-label="Main menu"
          onClick={onBackdrop}
          {...overlayMotion}
        >
          <div className="mega__bar">
            <span className="mega__eyebrow">Menu</span>
            <Link
              href="/"
              className="mega__wordmark"
              onClick={onClose}
              aria-label="Samorah — home"
            >
              Samorah
            </Link>
            <button
              type="button"
              className="mega__close"
              onClick={onClose}
              aria-label="Close menu"
            >
              <span className="mega__close-label">Close</span>
              <X size={18} strokeWidth={1.25} aria-hidden="true" />
            </button>
          </div>

          <div className="mega__inner">
            {/* LEFT — primary branches */}
            <nav className="mega__branches" aria-label="Sections">
              {MENU_BRANCHES.map((branch) => (
                <button
                  key={branch.id}
                  type="button"
                  className="mega__branch"
                  aria-current={branch.id === activeId ? "true" : undefined}
                  onMouseEnter={() => setActiveId(branch.id)}
                  onFocus={() => setActiveId(branch.id)}
                  onClick={() => setActiveId(branch.id)}
                >
                  {branch.label}
                </button>
              ))}
            </nav>

            {/* CENTER + RIGHT — crossfade together when the branch changes */}
            <motion.div key={active.id} className="mega__panel" {...panelMotion}>
              <nav className="mega__links" aria-label={`${active.label} links`}>
                {active.items.map((item) => {
                  const tier = item.tier ? ` mega__link--${item.tier}` : "";
                  return item.isComingSoon ? (
                    <span
                      key={item.label}
                      className={`mega__link mega__link--soon${tier}`}
                      aria-disabled="true"
                    >
                      {item.label}
                      <span className="mega__soon">Coming Soon</span>
                    </span>
                  ) : (
                    <Link
                      key={item.label}
                      href={item.href}
                      className={`mega__link${tier}`}
                      onClick={onClose}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              <Link
                href={active.campaign.href}
                className={`mega__campaign ${active.campaign.gradient}`}
                onClick={onClose}
              >
                <span className="mega__campaign-overlay" aria-hidden="true" />
                <span className="mega__campaign-content">
                  <span className="mega__campaign-eyebrow">
                    {active.campaign.eyebrow}
                  </span>
                  <span className="mega__campaign-title">
                    {active.campaign.title}
                  </span>
                  <span className="mega__campaign-desc">
                    {active.campaign.description}
                  </span>
                </span>
              </Link>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
