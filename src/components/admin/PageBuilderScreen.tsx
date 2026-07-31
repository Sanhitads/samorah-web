import { redirect, notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getPageAdmin } from "@/services/pageComposerService";
import { COMPOSABLE_PAGES, resolveAdminSections, pageSchemas } from "@/config/composablePages";
import { listMedia } from "@/services/media/mediaService";
import { listProductsAdmin } from "@/services/productAdminService";
import { listSectionTemplates } from "@/services/sectionLibraryService";
import { listSeoOverrides } from "@/services/seoRedirectService";
import { canonicalOrigin } from "@/config/site";
import { SECTION_TEMPLATES } from "@/config/sectionTemplates";
import { getPageType } from "@/lib/cms/pageRegistry";
import { resolveContent } from "@/lib/cms/sectionSchema";
import { getActiveCampaign } from "@/config/campaigns";
import { PageBuilder, type SectionTemplate } from "@/components/admin/PageBuilder";
import type { EntityOptions } from "@/components/admin/SchemaForm";

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

  // Section templates (point 8): resolve each to real starter settings from its type's schema + config
  // defaults, but only offer types this page supports. Coming-soon entries pass through disabled.
  const pt = getPageType(pageKey);
  const cid = getActiveCampaign().id;
  const templates: SectionTemplate[] = SECTION_TEMPLATES.filter((t) => t.comingSoon || (!!t.type && !!schemas[t.type])).map((t) => {
    const def = t.type ? pt?.sections[t.type] : undefined;
    const settings = def ? resolveContent(def.schema, def.defaults(cid), t.overrides ?? {}) : {};
    return { id: t.id, label: t.label, description: t.description, type: t.type, settings, comingSoon: !!t.comingSoon };
  });
  const library = canManage ? await listSectionTemplates() : [];

  // Page SEO (Phase 5 · point 24) — the DB override for this page's live path, edited in-builder.
  const seoRow = canManage ? (await listSeoOverrides()).find((r) => r.path === page.previewPath) : undefined;
  const seo = canManage
    ? { title: seoRow?.title ?? "", description: seoRow?.description ?? "", ogImage: seoRow?.ogImage ?? "", canonical: seoRow?.canonical ?? "", robots: seoRow?.robots ?? "" }
    : undefined;

  // Product options (with data) so a Featured-Atmosphere block can "Pull from a product" — the picker
  // fills its fields from a real product, then stays fully editable (or leave blank + type your own).
  let entities: EntityOptions = {};
  if (canManage) {
    const products = await listProductsAdmin();
    entities = {
      product: products.map((p) => ({
        id: p.id, label: p.name,
        data: { title: p.name, image: p.imageUrl ?? "", chapter: p.collectionName ?? "", productType: p.scentGroup ?? p.fragranceFamily ?? "", ctaHref: `/shop/${p.slug}`, ctaLabel: `Discover ${p.name}` },
      })),
    };
  }

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Content · {staff.role}</p>
        <h1 className="admin__title">{page.label} Builder</h1>
        <p className="admin__count">{view.draft.length} sections · {view.state}{canManage ? "" : " · read-only (needs catalog.manage)"}</p>
      </header>
      {canManage ? (
        <PageBuilder pageKey={pageKey} label={page.label} view={{ ...view, draft: resolved }} sectionMeta={sectionMeta} schemas={schemas} media={media} entities={entities} templates={templates} library={library} previewPath={page.previewPath} previewCookie={page.previewCookie} livePreviewSrc={page.livePreviewSrc} seo={seo} seoOrigin={canonicalOrigin()} />
      ) : (
        <p className="admin__empty">Editing this page needs the catalog.manage capability.</p>
      )}
    </main>
  );
}
