import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { listRedirectsWithHealth, listSeoOverrides } from "@/services/seoRedirectService";
import { listLinkableEntities } from "@/services/navigationService";
import { listMedia } from "@/services/media/mediaService";
import { SeoRedirectsManager } from "@/components/admin/SeoRedirectsManager";

/**
 * SEO & Redirects — `/admin/seo` (CMS slice 6). DB-driven 301/302 redirects (applied in middleware) +
 * per-route meta/OG/robots overrides. RBAC: content.edit to view; content.publish to mutate (enforced
 * server-side in /api/admin/seo — every save is an immediate production change).
 */
export const metadata: Metadata = { title: "SEO & Redirects", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SeoPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  if (!hasCapability(staff.role, "content.edit")) {
    return <main className="admin"><header className="admin__head"><p className="admin__eyebrow">Content · {staff.role}</p><h1 className="admin__title">SEO &amp; Redirects</h1></header><p className="admin__empty">Needs the content.edit capability.</p></main>;
  }
  const canPublish = hasCapability(staff.role, "content.publish");
  const [redirects, seo, entities, media] = await Promise.all([
    listRedirectsWithHealth(),
    listSeoOverrides(),
    listLinkableEntities(),
    listMedia({ limit: 60 }).then((rows) => rows.map((m) => ({ id: m.id, url: m.url, title: m.title || m.url }))),
  ]);

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Content · {staff.role}</p>
        <h1 className="admin__title">SEO &amp; Redirects</h1>
        <p className="admin__count">{redirects.length} redirects · {seo.length} meta overrides{canPublish ? "" : " · read-only (needs content.publish to change)"}</p>
      </header>
      <SeoRedirectsManager redirects={redirects} seo={seo} entities={entities} media={media} canPublish={canPublish} />
    </main>
  );
}
