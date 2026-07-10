import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getHomepageAdmin, SECTION_META, SECTION_TYPES } from "@/services/homepageService";
import { SECTION_DEFS, SECTION_SCHEMAS } from "@/config/homepageSchemas";
import { resolveContent } from "@/lib/cms/sectionSchema";
import { getActiveCampaign } from "@/config/campaigns";
import { listMedia } from "@/services/media/mediaService";
import { HomepageManager } from "@/components/admin/HomepageManager";

/**
 * Homepage Builder — `/admin/homepage` (CMS slice 4 + schema authoring). Compose
 * typed sections AND edit their content via schema-generated forms, then draft →
 * preview → publish. A publishable resource with revision history. catalog.manage.
 */
export const metadata: Metadata = { title: "Homepage", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function HomepageBuilderPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const canManage = hasCapability(staff.role, "catalog.manage");
  const view = await getHomepageAdmin();
  const meta = SECTION_TYPES.map((t) => ({ type: t, ...SECTION_META[t] }));
  const campaignId = getActiveCampaign().id;

  // Resolve each section's effective content (config baseline ⊕ saved settings) so
  // the schema forms open showing the CURRENT live values.
  const resolved = view.draft.map((s) => {
    const def = SECTION_DEFS[s.type];
    return { ...s, settings: def ? resolveContent(def.schema, def.defaults(campaignId), s.settings) : s.settings };
  });
  const media = (await listMedia({ limit: 100 })).map((m) => ({ id: m.id, url: m.url, title: m.title || m.alt || m.url }));

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Content · {staff.role}</p>
        <h1 className="admin__title">Homepage Builder</h1>
        <p className="admin__count">{view.draft.length} sections · {view.state}{canManage ? "" : " · read-only (needs catalog.manage)"}</p>
      </header>
      {canManage ? (
        <HomepageManager view={{ ...view, draft: resolved }} sectionMeta={meta} schemas={SECTION_SCHEMAS} media={media} />
      ) : (
        <p className="admin__empty">Editing the homepage needs the catalog.manage capability.</p>
      )}
    </main>
  );
}
