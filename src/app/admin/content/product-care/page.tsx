import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { listPagesAdmin } from "@/services/cmsService";
import { ContentManager } from "@/components/admin/ContentManager";

/**
 * Product Care editor — `/admin/content/product-care`. Deep-link into the existing ContentManager:
 * an editorial per-section editor (step / small heading / title / body / image / layout / ratio /
 * accordion Q&A / visibility) with a faithful side-by-side live preview. Same CMS, publishing,
 * scheduling, SEO, revisions and audit as every other page.
 */
export const metadata: Metadata = { title: "Product Care", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ProductCareContentPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  if (!hasCapability(staff.role, "catalog.manage")) redirect("/admin/content");

  const pages = await listPagesAdmin();

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Content · {staff.role}</p>
        <h1 className="admin__title">Product Care</h1>
        <p className="admin__count">Edit the CMS-managed <span className="admin__mono">/product-care</span> editorial page — sections, imagery, accordions, draft, publish &amp; history</p>
      </header>
      <ContentManager pages={pages} initialSlug="product-care" />
    </main>
  );
}
