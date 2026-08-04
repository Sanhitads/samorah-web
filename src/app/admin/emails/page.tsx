import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { listEmailTemplatesAdmin } from "@/services/emailTemplateService";
import { getEmailDeliveryHealth } from "@/services/emailDeliveryService";
import { EMAIL_TEMPLATE_SCHEMA } from "@/lib/email/blocks";
import { listMedia } from "@/services/media/mediaService";
import { EmailTemplatesManager } from "@/components/admin/EmailTemplatesManager";

/**
 * Email Templates — `/admin/emails` (CMS slice 5). Transactional email copy edited as a
 * draft→publish resource. The production send path reads only the PUBLISHED version.
 * RBAC split: content.edit prepares/saves drafts; content.publish makes an email live / sends tests.
 */
export const metadata: Metadata = { title: "Emails", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function EmailsPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const canEdit = hasCapability(staff.role, "content.edit");
  const canPublish = hasCapability(staff.role, "content.publish");
  const templates = await listEmailTemplatesAdmin();
  const health = await getEmailDeliveryHealth(templates.map((t) => t.key));
  const media = (await listMedia({ limit: 60 })).map((m) => ({ id: m.id, url: m.url, title: m.title || m.url }));
  const draftCount = templates.filter((t) => t.status === "draft").length;

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Content · {staff.role}</p>
        <h1 className="admin__title">Email Templates</h1>
        <p className="admin__count">{templates.length} transactional emails{draftCount ? ` · ${draftCount} unpublished draft${draftCount > 1 ? "s" : ""}` : ""}{canEdit ? (canPublish ? "" : " · draft-only (needs content.publish to go live)") : " · read-only (needs content.edit)"}</p>
      </header>
      {canEdit ? (
        <EmailTemplatesManager templates={templates} fields={EMAIL_TEMPLATE_SCHEMA.fields} media={media} canPublish={canPublish} health={health} />
      ) : (
        <div className="admin__table-wrap"><table className="admin__table admin__table--board"><thead><tr><th>Email</th><th>Published subject</th><th>Status</th></tr></thead>
          <tbody>{templates.map((t) => <tr key={t.key}><td>{t.def.label}</td><td className="admin__muted">{t.published.subject}</td><td>{t.source === "db" ? t.status : "default"}</td></tr>)}</tbody></table></div>
      )}
    </main>
  );
}
