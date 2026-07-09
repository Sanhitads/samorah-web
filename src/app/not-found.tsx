import Link from "next/link";

/** Editorial 404 — quiet, on-brand, offers a way back rather than a dead end. */
export default function NotFound() {
  return (
    <main className="sys-page">
      <p className="sys-page__eyebrow">Error 404</p>
      <h1 className="sys-page__title">This page has drifted away.</h1>
      <p className="sys-page__body">The page you're looking for doesn't exist, or has moved. Let's find your way back.</p>
      <div className="sys-page__actions">
        <Link href="/" className="btn btn-dark">Return home</Link>
        <Link href="/shop" className="btn btn-outline">Explore the collection</Link>
      </div>
    </main>
  );
}
