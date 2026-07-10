import Link from "next/link";

/**
 * Draft-preview banner with a one-click exit. Preview is URL-driven (`?preview=1`),
 * so "Exit preview" is simply a link to the live path — no cookie to clear, and the
 * plain URL is always the live page.
 */
export function PreviewBanner({ label, livePath }: { label: string; livePath: string }) {
  return (
    <div className="store-notice preview-banner" role="status" style={{ background: "#8a3d2f", color: "#fff" }}>
      Previewing draft {label} — not live.{" "}
      <Link href={livePath} prefetch={false} style={{ color: "#fff", textDecoration: "underline", fontWeight: 600 }}>Exit preview</Link>
    </div>
  );
}
