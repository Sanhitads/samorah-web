import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { listPagesAdmin } from "@/services/cmsService";
import { ContentManager } from "@/components/admin/ContentManager";

/**
 * Craft & Materials editor — `/admin/content/craft-materials`. Deep-links the existing ContentManager
 * with the same editorial editor Behind Samorah uses (person / image break / statement / divider,
 * displayStyle, Media Library imagery, an optional hero image, move / duplicate / hide / delete) and a
 * faithful live preview. Same CMS, publishing, scheduling, SEO, revisions and audit as every page.
 */
export const metadata: Metadata = { title: "Craft & Materials", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CraftMaterialsContentPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  if (!hasCapability(staff.role, "catalog.manage")) redirect("/admin/content");

  const pages = await listPagesAdmin();

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Content · {staff.role}</p>
        <h1 className="admin__title">Craft &amp; Materials</h1>
        <p className="admin__count">Edit the CMS-managed <span className="admin__mono">/craft-materials</span> editorial page — craft, materials, imagery, hero, draft, publish &amp; history</p>
      </header>
      <ContentManager pages={pages} initialSlug="craft-materials" />
    </main>
  );
}
