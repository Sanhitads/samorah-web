"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackScrollDepth, trackTimeEngaged } from "@/lib/analytics/events";

/**
 * Engagement tracker (review points 4, 5) — the signal that matters for editorial luxury:
 * did visitors actually READ the scent stories? Fires scroll_depth (25/50/75/100%) and
 * time_engaged (30/60/120/300s) once each per page, resetting on every route change. Purely
 * client-side + consent-gated via the facade. No layout impact (renders null).
 */
const DEPTHS = [25, 50, 75, 100] as const;
const TIMES = [30, 60, 120, 300] as const;

export function EngagementTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const firedDepth = new Set<number>();

    const onScroll = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      if (scrollable <= 0) return;
      const pct = Math.min(100, Math.round((doc.scrollTop / scrollable) * 100));
      for (const d of DEPTHS) {
        if (pct >= d && !firedDepth.has(d)) {
          firedDepth.add(d);
          trackScrollDepth(d, pathname);
        }
      }
    };

    const timers = TIMES.map((secs) => window.setTimeout(() => trackTimeEngaged(secs, pathname), secs * 1000));
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll(); // catch short pages already fully in view

    return () => {
      window.removeEventListener("scroll", onScroll);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [pathname]);

  return null;
}
