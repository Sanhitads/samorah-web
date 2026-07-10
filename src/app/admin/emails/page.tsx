import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { listEmailTemplates } from "@/services/emailTemplateService";
import { EmailTemplatesManager } from "@/components/admin/EmailTemplatesManager";

/**
 * Email Templates — `/admin/emails` (CMS slice 5). Edit transactional email subject
 * lines as content (with {{tokens}} + preview). The send path reads the override.
 * catalog.manage.
 */
export const metadata: Metadata = { title: "Emails", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function EmailsPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const canManage = hasCapability(staff.role, "catalog.manage");
  const templates = await listEmailTemplates();

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Content · {staff.role}</p>
        <h1 className="admin__title">Email Templates</h1>
        <p className="admin__count">{templates.length} transactional emails{canManage ? "" : " · read-only (needs catalog.manage)"}</p>
      </header>
      {canManage ? (
        <EmailTemplatesManager templates={templates} />
      ) : (
        <div className="admin__table-wrap"><table className="admin__table admin__table--board"><thead><tr><th>Email</th><th>Subject</th><th>Source</th></tr></thead>
          <tbody>{templates.map((t) => <tr key={t.key}><td>{t.def.label}</td><td className="admin__muted">{t.subject}</td><td>{t.source}</td></tr>)}</tbody></table></div>
      )}
    </main>
  );
}
