import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { RecallConsole } from "@/components/admin/RecallConsole";

/**
 * Recalls & holds — `/admin/recalls` (Phase 9). Formal recall/hold case management, containment and
 * affected-customer traceability. Gated by manufacturing.recall (admin+). All operations go through
 * /api/admin/recalls, server-enforced. External customer notifications are disabled (contact-list prep only).
 */
export const metadata: Metadata = { title: "Recalls", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function RecallsPage() {
  const staff = await requireStaff("admin");
  if (!staff.ok) redirect("/login");
  if (!hasCapability(staff.role, "manufacturing.recall")) {
    return (
      <main className="admin">
        <header className="admin__head"><p className="admin__eyebrow">Safety · {staff.role}</p><h1 className="admin__title">Recalls</h1></header>
        <p className="admin__empty">Needs the manufacturing.recall capability (admin+).</p>
      </main>
    );
  }
  return (
    <main className="admin">
      <header className="admin__head"><p className="admin__eyebrow">Safety · {staff.role}</p><h1 className="admin__title">Recalls &amp; holds</h1></header>
      <RecallConsole />
    </main>
  );
}
