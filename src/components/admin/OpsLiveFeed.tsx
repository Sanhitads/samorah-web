"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Live feed — subscribes to notification_log via Supabase Realtime and refreshes the server
 * component on change, so the feed, counters, badges and channel status all update together
 * without a manual reload. Mirrors the pattern the existing Notification Centre uses.
 *
 * Requires the staff SELECT policy + realtime publication added in the Phase 16 migration
 * (Realtime enforces RLS — without a policy the browser would silently receive nothing).
 *
 * Refreshes are debounced: a burst of inserts (one row per channel in a fan-out) must not trigger
 * a refresh per row. Falls back to a slow poll if the socket never connects.
 */
export function OpsLiveFeed() {
  const router = useRouter();
  const [live, setLive] = useState(false);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let connected = false;

    const bump = () => {
      setPulse((p) => p + 1);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 700);   // debounce a fan-out burst into one refresh
    };

    const channel = supabase
      .channel("ops-notification-log")
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "notification_log" } as never, bump)
      .subscribe((status: string) => { connected = status === "SUBSCRIBED"; setLive(connected); });

    // Safety net: if realtime never connects (RLS/publication/network), keep the page fresh anyway.
    const poll = setInterval(() => { if (!connected) router.refresh(); }, 30_000);

    return () => { if (timer) clearTimeout(timer); clearInterval(poll); supabase.removeChannel(channel); };
  }, [router]);

  return (
    <span className={`nlog-live${live ? " is-live" : ""}`} title={live ? "Connected to Supabase Realtime — updates arrive instantly" : "Realtime not connected — falling back to a 30s refresh"}>
      <span className="nlog-live__dot" aria-hidden />
      {live ? "Live" : "Polling"}{pulse > 0 ? ` · ${pulse} update${pulse === 1 ? "" : "s"}` : ""}
    </span>
  );
}
