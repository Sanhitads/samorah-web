import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { listRedirects, listSeoOverrides } from "@/services/seoRedirectService";
import { SeoRedirectsManager } from "@/components/admin/SeoRedirectsManager";

/**
 * SEO & Redirects — `/admin/seo` (CMS slice 6). DB-driven 301/302 redirects (applied
 * in middleware) + per-route meta/OG/robots overrides. catalog.manage.
 */
export const metadata: Metadata = { title: "SEO & Redirects", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SeoPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  if (!hasCapability(staff.role, "catalog.manage")) {
    return <main className="admin"><header className="admin__head"><p className="admin__eyebrow">Content · {staff.role}</p><h1 className="admin__title">SEO &amp; Redirects</h1></header><p className="admin__empty">Needs the catalog.manage capability.</p></main>;
  }
  const [redirects, seo] = await Promise.all([listRedirects(), listSeoOverrides()]);

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Content · {staff.role}</p>
        <h1 className="admin__title">SEO &amp; Redirects</h1>
        <p className="admin__count">{redirects.length} redirects · {seo.length} meta overrides</p>
      </header>
      <SeoRedirectsManager redirects={redirects} seo={seo} />
    </main>
  );
}
