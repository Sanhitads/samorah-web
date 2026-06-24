"use client";

import Link from "next/link";
import { Search, ShoppingBag, User } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Site Header (Phase 6 · Component 2) — the architectural frame.
 *
 * Intentionally isolated: it knows nothing of the Mega Menu, Search Overlay,
 * Cart Drawer, or authentication. It only renders the frame and exposes clean
 * callback + state props so those components can wire in later without coupling.
 *
 * Two modes (`floating`):
 *   • solid (default) — sticky ivory; warms to glass + hairline shadow on scroll.
 *   • floating        — fixed & transparent over a hero (text tone light/dark);
 *                       settles into ivory glass on scroll. The homepage enables
 *                       this in Phase 7 once a hero exists to float over.
 */
export interface HeaderProps {
  /** Float transparently over a hero, warming to ivory glass on scroll. */
  floating?: boolean;
  /** Text colour while transparent: "light" over dark heroes, "dark" over light. */
  floatingTone?: "light" | "dark";
  /** Cart item count for the badge. Wired to useCartStore in Component 5. */
  cartCount?: number;
  /** Reflects Mega Menu open state for aria-expanded (Component 3). */
  menuOpen?: boolean;
  /** Open the Mega Menu (Component 3). */
  onMenuClick?: () => void;
  /** Open the Search Overlay (Component 4). */
  onSearchClick?: () => void;
  /** Account action — integrates with Phase 3 auth later (Component / page). */
  onAccountClick?: () => void;
  /** Open the Cart Drawer (Component 5). */
  onCartClick?: () => void;
}

// Just past the announcement bar — where the frame begins to settle.
const SCROLL_THRESHOLD = 24;

export function Header({
  floating = false,
  floatingTone = "light",
  cartCount = 0,
  menuOpen = false,
  onMenuClick,
  onSearchClick,
  onAccountClick,
  onCartClick,
}: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        setScrolled(window.scrollY > SCROLL_THRESHOLD);
        raf = 0;
      });
    };
    onScroll(); // initialise (e.g. refreshed mid-page)
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <header
      className="site-header"
      data-variant={floating ? "floating" : "solid"}
      data-tone={floatingTone}
      data-scrolled={scrolled}
    >
      <div className="site-header__inner">
        {/* LEFT — single Menu trigger */}
        <button
          type="button"
          className="site-header__menu"
          aria-label="Open navigation menu"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={onMenuClick}
        >
          <span className="site-header__menu-glyph" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="site-header__menu-label">Menu</span>
        </button>

        {/* CENTER — wordmark anchor */}
        <Link
          href="/"
          className="site-header__wordmark"
          aria-label="Samorah — home"
        >
          Samorah
        </Link>

        {/* RIGHT — Search · Account · Cart */}
        <div className="site-header__actions">
          <button
            type="button"
            className="site-header__action"
            aria-label="Search"
            aria-haspopup="dialog"
            onClick={onSearchClick}
          >
            <Search
              className="site-header__action-icon"
              size={18}
              strokeWidth={1.25}
              aria-hidden="true"
            />
            <span className="site-header__action-label">Search</span>
          </button>

          <button
            type="button"
            className="site-header__action"
            aria-label="Account"
            onClick={onAccountClick}
          >
            <User
              className="site-header__action-icon"
              size={18}
              strokeWidth={1.25}
              aria-hidden="true"
            />
            <span className="site-header__action-label">Account</span>
          </button>

          <button
            type="button"
            className="site-header__action"
            aria-label={
              cartCount > 0
                ? `Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`
                : "Cart"
            }
            aria-haspopup="dialog"
            onClick={onCartClick}
          >
            <ShoppingBag
              className="site-header__action-icon"
              size={18}
              strokeWidth={1.25}
              aria-hidden="true"
            />
            <span className="site-header__action-label">Cart</span>
            {cartCount > 0 && (
              <span className="site-header__count" aria-hidden="true">
                ({cartCount})
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
