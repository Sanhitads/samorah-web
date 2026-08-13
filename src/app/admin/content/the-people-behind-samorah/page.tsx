import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { listPagesAdmin } from "@/services/cmsService";
import { ContentManager } from "@/components/admin/ContentManager";

/**
 * People editor — `/admin/content/the-people-behind-samorah`. Deep-links the existing ContentManager
 * with a modular people editor: person sections (Feature / Card / Highlight via displayStyle) plus
 * image break / statement / divider, an optional hero image, and a faithful live preview. Same CMS,
 * publishing, scheduling, SEO, revisions and audit as every other page.
 */
export const metadata: Metadata = { title: "The People Behind Samorah", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PeopleContentPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  if (!hasCapability(staff.role, "catalog.manage")) redirect("/admin/content");

  const pages = await listPagesAdmin();

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Content · {staff.role}</p>
        <h1 className="admin__title">The People Behind Samorah</h1>
        <p className="admin__count">Edit the CMS-managed <span className="admin__mono">/the-people-behind-samorah</span> editorial page — people, imagery, hero, draft, publish &amp; history</p>
      </header>
      <ContentManager pages={pages} initialSlug="the-people-behind-samorah" />
    </main>
  );
}
