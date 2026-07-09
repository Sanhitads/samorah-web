"use client";

import { useEffect } from "react";
import Link from "next/link";

/** Route error boundary — recover with a retry, never a blank screen. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("route error", error);
  }, [error]);

  return (
    <main className="sys-page">
      <p className="sys-page__eyebrow">Something went wrong</p>
      <h1 className="sys-page__title">A quiet stumble.</h1>
      <p className="sys-page__body">We hit an unexpected error. Please try again — if it persists, a real person will help.</p>
      <div className="sys-page__actions">
        <button type="button" className="btn btn-dark" onClick={reset}>Try again</button>
        <Link href="/" className="btn btn-outline">Return home</Link>
      </div>
    </main>
  );
}
