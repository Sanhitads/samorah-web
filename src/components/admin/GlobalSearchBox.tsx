"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Top admin search box — navigates to /admin/search?q= (R1). */
export function GlobalSearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      className="ash-search"
      onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/admin/search?q=${encodeURIComponent(q.trim())}`); }}
    >
      <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Search everything…" aria-label="Search admin" />
    </form>
  );
}
