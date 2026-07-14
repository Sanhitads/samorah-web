"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWishlistStore } from "@/store/useWishlistStore";
import { trackWishlistOpened } from "@/lib/analytics/events";

/**
 * Wishlist page (review point 13). Saved fragrances with remove + view actions. The
 * wishlist syncs across devices for signed-in users (AccountSync), so this list follows
 * the customer. Stock notifications + sharing are the natural next additions.
 */
export default function WishlistPage() {
  const [mounted, setMounted] = useState(false);
  const items = useWishlistStore((s) => s.items);
  const remove = useWishlistStore((s) => s.removeFromWishlist);
  useEffect(() => setMounted(true), []); // persisted store → render after hydration
  // wishlist_opened (review point 9) — fired once the persisted list has hydrated.
  useEffect(() => { if (mounted) trackWishlistOpened(items.length); }, [mounted]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="acc" style={{ maxWidth: 960 }}>
      <header className="acc__head">
        <p className="acc__eyebrow">Saved</p>
        <h1 className="acc__title">Your wishlist</h1>
        <p className="acc__sub">Fragrances you&rsquo;ve saved — they follow you across devices when you&rsquo;re signed in.</p>
      </header>

      {!mounted ? null : items.length === 0 ? (
        <p className="acc__empty">Nothing saved yet. <Link href="/shop" className="text-link">Discover the collection →</Link></p>
      ) : (
        <ul className="wl-grid">
          {items.map((it) => (
            <li key={it.productId} className="wl-card">
              <Link href={`/shop/${it.slug}`} className="wl-card__media" aria-label={it.name}>
                <span className={`wl-card__grad ${it.gradClass ?? ""}`} aria-hidden="true" />
              </Link>
              <div className="wl-card__body">
                <Link href={`/shop/${it.slug}`} className="wl-card__name">{it.name}</Link>
                <span className="wl-card__price">₹{it.price.toLocaleString("en-IN")}</span>
              </div>
              <div className="wl-card__actions">
                <Link href={`/shop/${it.slug}`} className="acc-btn">View</Link>
                <button type="button" className="wl-remove" onClick={() => remove(it.productId)} aria-label={`Remove ${it.name}`}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
