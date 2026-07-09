import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { listRules } from "@/services/rulesAdminService";
import { RulesManager, type AdminRule } from "@/components/admin/RulesManager";

/**
 * Business Rules — `/admin/rules`. `trigger → condition → action` rules that let the
 * business change behaviour (insurance, courier, packaging, delivery mode) without a
 * deploy (principle f). The engine already evaluates them; this is the CRUD + dry-run.
 * Editing needs rules.manage.
 */
export const metadata: Metadata = { title: "Business Rules", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Stringify stored JSON values so the editor inputs can bind (arrays → comma list). */
function toAdminRule(r: Awaited<ReturnType<typeof listRules>>[number]): AdminRule {
  const val = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v));
  return {
    id: r.id,
    name: r.name,
    trigger: r.trigger,
    priority: r.priority,
    active: r.active,
    conditions: r.conditions.map((c) => ({ field: c.field, op: c.op, value: val(c.value) })),
    actions: r.actions.map((a) => ({ type: a.type, value: val(a.value) })),
  };
}

export default async function RulesPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const canManage = hasCapability(staff.role, "rules.manage");

  const rules = (await listRules()).map(toAdminRule);

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Configuration · {staff.role}</p>
        <h1 className="admin__title">Business Rules</h1>
        <p className="admin__count">{rules.length} {rules.length === 1 ? "rule" : "rules"}{canManage ? "" : " · read-only (needs rules.manage)"}</p>
      </header>

      {canManage ? (
        <RulesManager rules={rules} />
      ) : (
        <div className="admin__table-wrap">
          <table className="admin__table admin__table--board">
            <thead><tr><th>Name</th><th>Trigger</th><th>Priority</th><th>Active</th></tr></thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}><td>{r.name}</td><td className="admin__muted">{r.trigger}</td><td className="admin__mono">{r.priority}</td><td>{r.active ? "On" : "Off"}</td></tr>
              ))}
              {rules.length === 0 ? <tr><td colSpan={4} className="admin__empty">No rules yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
