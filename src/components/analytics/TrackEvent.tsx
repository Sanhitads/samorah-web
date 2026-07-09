"use client";

import { useEffect, useRef } from "react";
import { track, type AnalyticsEvent, type TrackParams } from "@/lib/analytics/track";

/**
 * Fires a single analytics event on mount — lets server components emit through the
 * one seam (e.g. view_item on a PDP, purchase on the confirmation page) without
 * becoming client components themselves.
 */
export function TrackEvent({ event, params }: { event: AnalyticsEvent; params?: TrackParams }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    track(event, params ?? {});
  }, [event, params]);
  return null;
}
