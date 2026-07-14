"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Top admin search box — navigates to /admin/search?q= (R1). Press "/" anywhere to
 *  focus it (review point 11.4), unless already typing in a field. */
export function GlobalSearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      className="ash-search"
      onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/admin/search?q=${encodeURIComponent(q.trim())}`); }}
    >
      <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Search everything…  ( / )" aria-label="Search admin" />
    </form>
  );
}
