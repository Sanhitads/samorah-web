import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getSystemHealth } from "@/services/healthService";

/** System health — `/admin/health`. Service status at a glance (R8). */
export const metadata: Metadata = { title: "System Health", robots: { index: false } };
export const dynamic = "force-dynamic";

const DOT: Record<string, string> = { ok: "🟢", warn: "🟡", off: "⚪", down: "🔴" };

export default async function HealthPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const checks = await getSystemHealth();
  const down = checks.filter((c) => c.status === "down").length;
  const warn = checks.filter((c) => c.status === "warn").length;

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Operations · {staff.role}</p>
        <h1 className="admin__title">System Health</h1>
        <p className="admin__count">{down ? `${down} down` : warn ? `${warn} need attention` : "All systems nominal"}</p>
      </header>

      <ul className="health-list">
        {checks.map((c) => (
          <li key={c.name} className="health-item" data-s={c.status}>
            <span className="health-item__dot">{DOT[c.status]}</span>
            <span className="health-item__name">{c.name}</span>
            <span className="health-item__detail admin__muted">{c.detail}</span>
            <span className="health-item__status">{c.status}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
