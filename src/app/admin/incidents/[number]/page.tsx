import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getIncidentByNumber, getStaffUsers } from "@/services/incidentService";
import { IncidentToolbar, IncidentChecklist, IncidentNoteForm, IncidentResolve } from "@/components/admin/IncidentControls";
import { EscalationCountdown, IncidentRunbook, IncidentCorrection, DeleteSimulation } from "@/components/admin/IncidentEnterprise";
import { TEAM_LABEL, ROOT_CAUSE_LABEL, SUBSYSTEM_LABEL, type RootCauseSystem, type Subsystem } from "@/config/incidents";

export const metadata: Metadata = { title: "Incident", robots: { index: false } };
export const dynamic = "force-dynamic";

const SEV_ICON: Record<string, string> = { critical: "🔴", high: "🟠", medium: "🟡", low: "🔵", info: "⚪" };
const SLA_LABEL: Record<string, string> = { none: "—", on_track: "On track", at_risk: "At risk", breached: "Breached", met: "Met" };
const HIST_LABEL: Record<string, string> = {
  created: "Incident created", assigned: "Assigned", transferred: "Transferred", unassigned: "Unassigned",
  status_changed: "Status changed", severity_changed: "Severity changed", team_changed: "Team changed",
  comment_added: "Note added", note_added: "Note added", checklist_toggled: "Checklist updated",
  watcher_added: "Watcher added", watcher_removed: "Watcher removed", snoozed: "Snoozed",
  notification_added: "Notification added", notification_removed: "Notification removed", notification_resolved: "Notification resolved", resolved: "Incident resolved",
  root_cause_detected: "Root cause detected", correlated: "Cross-system correlation", escalated: "Escalated",
  confidence_scored: "Confidence scored", threshold_context: "Dynamic threshold", priority_set: "Priority set",
  auto_assigned: "Auto-assigned", recovery_detected: "Recovery detected", sla_breached: "SLA breached",
  merged: "Merged", split: "Split", dismissed: "Dismissed", reclassified: "Reclassified",
  runbook_step: "Runbook step", postmortem_generated: "Postmortem generated", simulation_created: "Simulation created", simulation_preview: "Simulation preview",
};
const dt = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const fmtDur = (m: number | null) => (m == null ? "—" : m < 60 ? `${m} min` : m < 1440 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} d`);
const HEALTH_ICON: Record<string, string> = { healthy: "🟢", warning: "🟡", critical: "🔴" };

export default async function IncidentDetailPage({ params }: { params: Promise<{ number: string }> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const { number } = await params;
  const [inc, staffUsers] = await Promise.all([getIncidentByNumber(number), getStaffUsers()]);
  if (!inc) notFound();

  const watchers = inc.participants.filter((p) => p.role === "watcher");
  const followers = inc.participants.filter((p) => p.role === "follower");

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow"><Link href="/admin/incidents" className="od-back">← Incidents</Link></p>
        <h1 className="admin__title">{inc.number}{inc.isSimulation ? <span className="inc-simbadge">SIMULATION</span> : null}</h1>
        <p className="admin__count">
          {inc.priority ? <span className="inc-prio" data-p={inc.priority}>{inc.priorityLabel}</span> : null}
          <span className="inc-sev" data-s={inc.severity} style={{ marginLeft: 8 }}>{SEV_ICON[inc.severity]} {inc.severity}</span>
          <span className="inc-status" data-s={inc.status} style={{ marginLeft: 8 }}>{inc.status}</span>
          {inc.confidence != null ? <span className="inc-conf" title="How sure the engine is" style={{ marginLeft: 8 }}>◎ {inc.confidence}% confidence</span> : null}
          <span className="admin__muted"> · {inc.title}</span>
        </p>
      </header>

      {/* Status banners */}
      {inc.isSimulation ? <div className="inc-banner inc-banner--sim">🧪 Fire drill — this incident is a simulation and is excluded from health, analytics and metrics. Escalations do not send real pages. <DeleteSimulation number={inc.number} /></div> : null}
      {inc.mergedIntoNumber ? <div className="inc-banner inc-banner--info">🔀 Merged into <Link href={`/admin/incidents/${inc.mergedIntoNumber}`} className="admin__mono">{inc.mergedIntoNumber}</Link>.</div> : null}
      {inc.splitFromNumber ? <div className="inc-banner inc-banner--info">✂ Split from <Link href={`/admin/incidents/${inc.splitFromNumber}`} className="admin__mono">{inc.splitFromNumber}</Link>.</div> : null}
      {inc.falsePositive ? <div className="inc-banner inc-banner--warn">🚫 Dismissed as a false positive{inc.dismissReason ? ` — ${inc.dismissReason}` : ""}.</div> : null}
      {inc.recoveryAt ? <div className="inc-banner inc-banner--ok">✅ Recovery detected — the upstream system is responding normally (auto-resolved {dt(inc.recoveryAt)}).</div> : null}
      {inc.slaBreached ? <div className="inc-banner inc-banner--warn">⏰ SLA breached — resolution target of {inc.slaTargetMin}m was exceeded.</div> : null}
      {inc.suggestedResolution ? <div className="inc-banner inc-banner--info">💡 Suggested resolution from <Link href={`/admin/incidents/${inc.suggestedResolution.number}`} className="admin__mono">{inc.suggestedResolution.number}</Link>: {inc.suggestedResolution.resolution}</div> : null}

      <IncidentToolbar number={inc.number} status={inc.status} severity={inc.severity} team={inc.team} assigneeName={inc.assigneeName} staffUsers={staffUsers} />

      {/* Enterprise strip: SLA + escalation countdown */}
      {!["resolved", "closed", "merged", "dismissed"].includes(inc.status) ? (
        <div className="inc-slastrip">
          <span className={`inc-sla inc-sla--${inc.slaStatus}`}>SLA: {SLA_LABEL[inc.slaStatus]}{inc.slaRemainingMin != null && inc.slaStatus !== "none" ? ` · ${inc.slaRemainingMin >= 0 ? `${inc.slaRemainingMin}m left` : `${-inc.slaRemainingMin}m over`}` : ""}{inc.slaTargetMin ? ` (target ${inc.slaTargetMin}m)` : ""}</span>
          <EscalationCountdown next={inc.nextEscalation} />
        </div>
      ) : null}

      {/* Overview + People */}
      <div className="od-grid">
        <section className="od-card">
          <h2 className="od-card__title">Overview</h2>
          <div className="od-detail">
            <div><dt>Category</dt><dd>{inc.categoryLabel}</dd></div>
            <div><dt>Source system</dt><dd>{inc.sourceSystem ?? "—"}</dd></div>
            <div><dt>Root cause</dt><dd>{inc.rootCause ?? "—"}</dd></div>
            <div><dt>Affected orders</dt><dd>{inc.affectedOrders}</dd></div>
            <div><dt>Affected notifications</dt><dd>{inc.affectedNotifications}</dd></div>
            <div><dt>Started</dt><dd>{dt(inc.startedAt)}</dd></div>
            <div><dt>Last activity</dt><dd>{dt(inc.lastActivityAt)}</dd></div>
            <div><dt>Resolved</dt><dd>{inc.resolvedAt ? dt(inc.resolvedAt) : "—"}</dd></div>
          </div>
          {inc.description ? <p className="admin__muted" style={{ marginTop: 10, fontSize: 13 }}>{inc.description}</p> : null}
        </section>

        <section className="od-card">
          <h2 className="od-card__title">People</h2>
          <div className="od-detail">
            <div><dt>Team</dt><dd>{inc.team ? TEAM_LABEL[inc.team as keyof typeof TEAM_LABEL] ?? inc.team : "—"}</dd></div>
            <div><dt>Owner</dt><dd>{inc.ownerName ?? "—"}</dd></div>
            <div><dt>Assignee</dt><dd>{inc.assigneeName ?? "Unassigned"}</dd></div>
            <div><dt>Watchers</dt><dd>{watchers.length ? watchers.map((w) => w.userName).join(", ") : "—"}</dd></div>
            <div><dt>Followers</dt><dd>{followers.length ? followers.map((w) => w.userName).join(", ") : "—"}</dd></div>
          </div>
        </section>
      </div>

      {/* Root cause intelligence + Business impact */}
      <div className="od-grid">
        <section className="od-card">
          <h2 className="od-card__title">Root cause &amp; correlation</h2>
          <div className="od-detail">
            <div><dt>Detected system</dt><dd>{inc.rootCauseSystem ? ROOT_CAUSE_LABEL[inc.rootCauseSystem as RootCauseSystem] ?? inc.rootCauseSystem : "—"}</dd></div>
            <div><dt>Subsystem</dt><dd>{inc.subsystem ? SUBSYSTEM_LABEL[inc.subsystem as Subsystem] ?? inc.subsystem : "—"}</dd></div>
            <div><dt>Priority</dt><dd>{inc.priorityLabel ?? "—"} <span className="admin__muted">(impact {inc.impactLevelLabel ?? "—"})</span></dd></div>
            <div><dt>Confidence</dt><dd>{inc.confidence != null ? `${inc.confidence}%` : "—"}</dd></div>
            <div><dt>Mean time to detect</dt><dd>{fmtDur(inc.mttdMin)}</dd></div>
            <div><dt>Mean time to resolve</dt><dd>{fmtDur(inc.mttrMin)}</dd></div>
          </div>
          {inc.rootCauseWhy ? <p className="admin__muted" style={{ marginTop: 8, fontSize: 12 }}>Why: {inc.rootCauseWhy}</p> : null}
          {inc.confidenceReasons.length ? <p className="admin__muted" style={{ marginTop: 4, fontSize: 11 }}>Confidence: {inc.confidenceReasons.map((r) => `${r.detail} (+${r.points})`).join(" · ")}</p> : null}
          {inc.assignmentReason ? <p className="admin__muted" style={{ marginTop: 4, fontSize: 11 }}>Auto-assignment: {inc.assignmentReason}</p> : null}
          {inc.dependencyDownstream.length ? <p className="admin__muted" style={{ marginTop: 8, fontSize: 12 }}>Can cascade to: {inc.dependencyDownstream.map((d) => <span key={d.id} className="inc-depchip">{d.label}</span>)}</p> : null}
          {inc.parentNumber ? <p className="inc-group" style={{ marginTop: 10 }}>🔗 Part of a cross-system group — primary is <Link href={`/admin/incidents/${inc.parentNumber}`} className="admin__mono od-link">{inc.parentNumber}</Link></p> : null}
          {inc.children.length ? (
            <div style={{ marginTop: 10 }}>
              <p className="admin__muted" style={{ fontSize: 12, marginBottom: 4 }}>Correlated incidents in this group ({inc.children.length}):</p>
              {inc.children.map((c) => <div key={c.number} className="od-line"><Link href={`/admin/incidents/${c.number}`} className="admin__mono od-link">{c.number}</Link><span className="admin__muted">{c.title}</span><span className="inc-status" data-s={c.status}>{c.status}</span></div>)}
            </div>
          ) : null}
        </section>

        <section className="od-card">
          <h2 className="od-card__title">Business impact</h2>
          <div className="inc-impact">
            <div className="inc-impact__cell"><span className="inc-impact__v">{inc.impact.orders}</span><span className="inc-impact__k">Orders affected</span></div>
            <div className="inc-impact__cell"><span className="inc-impact__v">{inr(inc.impact.revenue)}</span><span className="inc-impact__k">Revenue affected</span></div>
            <div className="inc-impact__cell"><span className="inc-impact__v">{inc.impact.customers}</span><span className="inc-impact__k">Customers affected</span></div>
            <div className="inc-impact__cell"><span className="inc-impact__v">{inr(inc.impact.refundValue)}</span><span className="inc-impact__k">Refund value</span></div>
            <div className="inc-impact__cell"><span className="inc-impact__v">{inc.impact.shipmentsDelayed}</span><span className="inc-impact__k">Shipments delayed</span></div>
            <div className="inc-impact__cell inc-impact__cell--cost"><span className="inc-impact__v">{inr(inc.impact.cost)}</span><span className="inc-impact__k">Estimated cost</span></div>
          </div>
          <p className="admin__muted" style={{ marginTop: 8, fontSize: 11 }}>{inc.impact.computedAt ? `Estimated from affected orders · updated ${dt(inc.impact.computedAt)}` : "Not yet computed — runs on the next correlation cycle."}</p>
        </section>
      </div>

      {/* Runbook (guided workflow) + Correction (merge/split/dismiss/reclassify) */}
      <div className="od-grid">
        <section className="od-card">
          <h2 className="od-card__title">Runbook</h2>
          <p className="admin__muted" style={{ fontSize: 12, marginBottom: 8 }}>Guided, ordered response for a {inc.categoryLabel.toLowerCase()} incident.</p>
          <IncidentRunbook steps={inc.runbook} />
        </section>
        <section className="od-card">
          <h2 className="od-card__title">Correction</h2>
          <p className="admin__muted" style={{ fontSize: 12, marginBottom: 8 }}>Humans override automation: merge duplicates, split a mixed incident, reclassify, or dismiss a false positive.</p>
          <IncidentCorrection number={inc.number} notifications={inc.notifications} currentCategory={inc.category} />
        </section>
      </div>

      {/* Escalation + Similar incidents */}
      <div className="od-grid">
        <section className="od-card">
          <h2 className="od-card__title">Escalation</h2>
          {inc.escalations.length ? (
            <ul className="inc-timeline">
              {inc.escalations.map((e, i) => (
                <li key={i} className="inc-timeline__item">
                  <span className="inc-timeline__dot" />
                  <span className="inc-timeline__body"><b>L{e.level} → {e.targetRole}</b> <span className="admin__muted">via {e.channels}</span><span className="admin__muted"> — {e.reason}</span></span>
                  <span className="admin__muted inc-timeline__time">{dt(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="admin__muted">No escalations. Policy: unresolved 30 min → Manager · 1 h → Admin · 2 h → Slack/Email/SMS (severity ≥ medium).</p>}
        </section>

        <section className="od-card">
          <h2 className="od-card__title">Related incidents</h2>
          {inc.similar.length ? inc.similar.map((s) => (
            <div key={s.number} className="inc-similar">
              <p className="inc-similar__head">This incident resembles <Link href={`/admin/incidents/${s.number}`} className="admin__mono od-link">{s.number}</Link> <span className="inc-similar__score">{Math.round(s.score * 100)}% match</span></p>
              <p className="admin__muted" style={{ fontSize: 12 }}>{s.title} — {s.reasons.join(", ")}</p>
              {s.kbResolution ? <p className="inc-similar__kb"><b>Prior fix:</b> {s.kbResolution}{s.prevention ? ` · Prevention: ${s.prevention}` : ""}</p> : null}
            </div>
          )) : <p className="admin__muted">No resembling resolved incidents yet.</p>}
        </section>
      </div>

      {/* Knowledge base (once resolved) + resolve action */}
      {inc.kbResolution || inc.prevention ? (
        <section className="od-card">
          <h2 className="od-card__title">Knowledge base</h2>
          <div className="od-detail">
            <div><dt>Root cause</dt><dd>{inc.rootCause ?? "—"}</dd></div>
            <div><dt>Resolution</dt><dd>{inc.kbResolution ?? "—"}</dd></div>
            <div><dt>Prevention</dt><dd>{inc.prevention ?? "—"}</dd></div>
          </div>
        </section>
      ) : (
        <section className="od-card">
          <IncidentResolve number={inc.number} defaultRootCause={inc.rootCause} />
          <p className="admin__muted" style={{ marginTop: 8, fontSize: 12 }}>Resolving requires root cause, resolution &amp; prevention — captured to the knowledge base so future incidents can reuse the fix.</p>
        </section>
      )}

      {/* Postmortem (searchable, generated on resolve) */}
      {inc.postmortem ? (
        <section className="od-card">
          <h2 className="od-card__title">Postmortem</h2>
          <div className="inc-pm">
            <div className="inc-pm__row"><dt>Summary</dt><dd>{inc.postmortem.summary ?? "—"}</dd></div>
            <div className="inc-pm__row"><dt>Root cause</dt><dd>{inc.postmortem.rootCause ?? "—"}</dd></div>
            <div className="inc-pm__row"><dt>Impact</dt><dd>{inc.postmortem.impact ?? "—"}</dd></div>
            <div className="inc-pm__row"><dt>Resolution</dt><dd>{inc.postmortem.resolution ?? "—"}</dd></div>
            <div className="inc-pm__row"><dt>Lessons learned</dt><dd>{inc.postmortem.lessons ?? "—"}</dd></div>
          </div>
          {inc.postmortem.generatedAt ? <p className="admin__muted" style={{ marginTop: 6, fontSize: 11 }}>Generated {dt(inc.postmortem.generatedAt)}</p> : null}
        </section>
      ) : null}

      {/* Checklist + Notes */}
      <div className="od-grid">
        <section className="od-card">
          <h2 className="od-card__title">Checklist</h2>
          <IncidentChecklist items={inc.checklist} />
        </section>
        <section className="od-card">
          <h2 className="od-card__title">Notes ({inc.notes.length})</h2>
          <IncidentNoteForm number={inc.number} />
          <ul className="inc-notes">
            {inc.notes.map((n, i) => (
              <li key={i} className="inc-notes__item"><span>{n.note}</span><span className="admin__muted">{n.authorName ?? "Staff"} · {dt(n.createdAt)}</span></li>
            ))}
            {inc.notes.length === 0 ? <li className="admin__muted">No notes yet.</li> : null}
          </ul>
        </section>
      </div>

      {/* Timeline + Affected orders */}
      <div className="od-grid">
        <section className="od-card">
          <h2 className="od-card__title">Activity log</h2>
          <ul className="inc-timeline">
            {inc.history.map((h, i) => (
              <li key={i} className="inc-timeline__item">
                <span className="inc-timeline__dot" />
                <span className="inc-timeline__body"><b>{HIST_LABEL[h.event] ?? h.event}</b>{h.detail ? <span className="admin__muted"> — {h.detail}</span> : null}{h.actorName ? <span className="admin__muted"> · {h.actorName}</span> : null}</span>
                <span className="admin__muted inc-timeline__time">{dt(h.createdAt)}</span>
              </li>
            ))}
            {inc.history.length === 0 ? <li className="admin__muted">No events.</li> : null}
          </ul>
        </section>

        <section className="od-card">
          <h2 className="od-card__title">Affected orders ({inc.orders.length})</h2>
          {inc.orders.length ? inc.orders.map((o) => (
            <div key={o} className="od-line"><Link href={`/admin/orders/${o}`} className="admin__mono od-link">{o}</Link></div>
          )) : <p className="admin__muted">No order-linked notifications.</p>}
        </section>
      </div>

      {/* Affected notifications + logs/related */}
      <div className="od-grid">
        <section className="od-card">
          <h2 className="od-card__title">Affected notifications ({inc.notifications.length})</h2>
          {inc.notifications.map((n, i) => (
            <div key={i} className="od-line">
              <span className="admin__mono" style={{ fontSize: 12 }}>{n.orderNumber ?? n.alertKey}</span>
              <span className="inc-sev" data-s={n.severity ?? "info"}>{n.severity ?? "info"}</span>
              <span className="admin__muted">{n.resolvedAt ? "resolved" : "open"}</span>
            </div>
          ))}
          {inc.notifications.length === 0 ? <p className="admin__muted">None.</p> : null}
        </section>
        <section className="od-card">
          <h2 className="od-card__title">System logs</h2>
          <Link href={`/admin/audit?search=${encodeURIComponent(inc.orders[0] ?? inc.category)}`} className="text-link">View related audit logs →</Link>
          {inc.related.length ? (
            <>
              <h3 className="od-card__title" style={{ marginTop: 14, fontSize: "1rem" }}>Related incidents</h3>
              {inc.related.map((r) => (
                <div key={r.number} className="od-line"><Link href={`/admin/incidents/${r.number}`} className="admin__mono od-link">{r.number}</Link><span className="admin__muted">{r.title}</span><span className="inc-status" data-s={r.status}>{r.status}</span></div>
              ))}
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
