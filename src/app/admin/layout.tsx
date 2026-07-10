import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { AdminNav } from "@/components/admin/AdminNav";
import { getAlertCount } from "@/services/notificationCenterService";

/**
 * Admin shell (SLP principle 21) — the persistent frame every /admin module
 * renders inside: a module-map sidebar + the page content. The middleware gates
 * the whole /admin path (editor+); we re-check here so the shell never renders
 * for an unauthorised user (defence-in-depth). Modules stay standalone pages —
 * this only supplies the surrounding navigation.
 */
export const metadata: Metadata = { title: { default: "Admin", template: "%s · Samorah Admin" }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const alertCount = await getAlertCount();

  return (
    <div className="ash">
      <aside className="ash__sidebar">
        <AdminNav role={staff.role} alertCount={alertCount} />
      </aside>
      <div className="ash__main">{children}</div>
    </div>
  );
}
