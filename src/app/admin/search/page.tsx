import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { globalSearch, type SearchHit } from "@/services/searchService";

/** Global search results — `/admin/search?q=`. Cross-resource (R1). */
export const metadata: Metadata = { title: "Search", robots: { index: false } };
export const dynamic = "force-dynamic";

function Label({ hit }: { hit: SearchHit }) {
  if (!hit.highlight) return <span className="gs-hit__label">{hit.label}</span>;
  const { pre, match, post } = hit.highlight;
  return <span className="gs-hit__label">{pre}<mark className="gs-mark">{match}</mark>{post}</span>;
}

function Group({ title, hits }: { title: string; hits: SearchHit[] }) {
  if (!hits.length) return null;
  return (
    <section className="gs-group">
      <h2 className="gs-group__title">{title} <span className="admin__muted">({hits.length})</span></h2>
      <ul className="gs-list">
        {hits.map((h, i) => (
          <li key={i}><Link href={h.href} className="gs-hit"><Label hit={h} />{h.sublabel ? <span className="gs-hit__sub">{h.sublabel}</span> : null}</Link></li>
        ))}
      </ul>
    </section>
  );
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const results = await globalSearch(query, { pii: hasCapability(staff.role, "analytics.view"), actorId: staff.userId ?? undefined });
  const total = Object.values(results).reduce((a, b) => a + b.length, 0);

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Search</p>
        <h1 className="admin__title">{query ? `"${query}"` : "Search"}</h1>
        <p className="admin__count">{query ? `${total} result${total === 1 ? "" : "s"}` : "Type in the search bar above."}</p>
      </header>

      {query && total === 0 ? <p className="admin__empty">Nothing matched. Try an order number, email, product, coupon code, RMA, or page.</p> : null}

      <Group title="Orders" hits={results.orders} />
      <Group title="Customers" hits={results.customers} />
      <Group title="Products" hits={results.products} />
      <Group title="Coupons" hits={results.coupons} />
      <Group title="Returns" hits={results.returns} />
      <Group title="Pages" hits={results.pages} />
    </main>
  );
}
