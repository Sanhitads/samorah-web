import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { listMedia, listFolders, mediaConfigured } from "@/services/media/mediaService";
import { MediaManager } from "@/components/admin/MediaManager";

/**
 * Media Library — `/admin/media` (CMS slice 2). The single home for every visual
 * asset; everything else references a media id, never a copied URL. Editing needs
 * catalog.manage.
 */
export const metadata: Metadata = { title: "Media", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function MediaPage({ searchParams }: { searchParams: Promise<{ folder?: string; q?: string }> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const canManage = hasCapability(staff.role, "catalog.manage");
  const sp = await searchParams;

  const [items, folders] = await Promise.all([
    listMedia({ folder: sp.folder, search: sp.q }),
    listFolders(),
  ]);

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Content · {staff.role}</p>
        <h1 className="admin__title">Media Library</h1>
        <p className="admin__count">{items.length} asset{items.length === 1 ? "" : "s"}{canManage ? "" : " · read-only (needs catalog.manage)"}{mediaConfigured() ? "" : " · uploads off (paste URL)"}</p>
      </header>
      <MediaManager items={items} folders={folders} canManage={canManage} uploadsOn={mediaConfigured()} folder={sp.folder ?? "all"} q={sp.q ?? ""} />
    </main>
  );
}
