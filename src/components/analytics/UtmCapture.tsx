"use client";

import { useEffect } from "react";
import { captureUtm } from "@/lib/utm";

/** Mounts app-wide; records any utm_* params from the landing URL (last-touch). */
export function UtmCapture() {
  useEffect(() => {
    captureUtm(window.location.search);
  }, []);
  return null;
}
