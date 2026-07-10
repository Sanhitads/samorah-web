import { redirect, notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getPageAdmin } from "@/services/pageComposerService";
import { COMPOSABLE_PAGES, resolveAdminSections, pageSchemas } from "@/config/composablePages";
import { listMedia } from "@/services/media/mediaService";
import { PageBuilder } from "@/components/admin/PageBuilder";

/**
 * Shared admin screen for any composable page (homepage, about, …). Resolves the
 * page config from the catalogue, loads its draft + schemas + media, and renders the
 * one generic PageBuilder. A new page's admin is this screen with a different key.
 */
export async function PageBuilderScreen({ pageKey }: { pageKey: string }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const page = COMPOSABLE_PAGES[pageKey];
  if (!page) notFound();
  const canManage = hasCapability(staff.role, "catalog.manage");

  const view = await getPageAdmin(pageKey, page.cfg);
  const schemas = pageSchemas(pageKey);
  const sectionMeta = Object.keys(schemas).map((t) => ({ type: t, label: page.meta[t]?.label ?? t, note: page.meta[t]?.note ?? "" }));
  const resolved = resolveAdminSections(pageKey, view.draft);
  const media = (await listMedia({ limit: 100 })).map((m) => ({ id: m.id, url: m.url, title: m.title || m.alt || m.url }));

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Content · {staff.role}</p>
        <h1 className="admin__title">{page.label} Builder</h1>
        <p className="admin__count">{view.draft.length} sections · {view.state}{canManage ? "" : " · read-only (needs catalog.manage)"}</p>
      </header>
      {canManage ? (
        <PageBuilder pageKey={pageKey} label={page.label} view={{ ...view, draft: resolved }} sectionMeta={sectionMeta} schemas={schemas} media={media} previewPath={page.previewPath} previewCookie={page.previewCookie} />
      ) : (
        <p className="admin__empty">Editing this page needs the catalog.manage capability.</p>
      )}
    </main>
  );
}
