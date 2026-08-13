import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { listPagesAdmin } from "@/services/cmsService";
import { ContentManager } from "@/components/admin/ContentManager";

/**
 * Our Story editor — `/admin/content/our-story`. Deep-links the existing ContentManager with the same
 * editorial editor Behind Samorah / Craft & Materials use (person / image break / statement / divider,
 * displayStyle, Media Library imagery, an optional hero image, move / duplicate / hide / delete) plus a
 * faithful live preview. Same CMS, publishing, scheduling, SEO, revisions and audit as every page.
 */
export const metadata: Metadata = { title: "Our Story", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function OurStoryContentPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  if (!hasCapability(staff.role, "catalog.manage")) redirect("/admin/content");

  const pages = await listPagesAdmin();

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Content · {staff.role}</p>
        <h1 className="admin__title">Our Story</h1>
        <p className="admin__count">Edit the CMS-managed <span className="admin__mono">/our-story</span> editorial page — chapters, imagery, hero, draft, publish &amp; history</p>
      </header>
      <ContentManager pages={pages} initialSlug="our-story" />
    </main>
  );
}
