import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getEnquiryDetail } from "@/services/enquiryService";
import { ENQUIRY_STATUS_LABEL, nextEnquiryStates } from "@/lib/enquiries/state";
import { EnquiryManage } from "@/components/admin/EnquiryManage";

export const metadata: Metadata = { title: "Enquiry", robots: { index: false } };
export const dynamic = "force-dynamic";

const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function EnquiryDetail({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const { id } = await params;
  const detail = await getEnquiryDetail(id);
  if (!detail) notFound();
  const { enquiry: e, events } = detail;
  const canManage = hasCapability(staff.role, "enquiries.manage");

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow"><Link href="/admin/enquiries" className="od-back">← Customer Enquiries</Link></p>
        <h1 className="admin__title">{e.subject}</h1>
        <p className="admin__count"><span className="admin__mono">{e.number}</span> · <span className="ff-status" data-s={e.status}>{ENQUIRY_STATUS_LABEL[e.status]}</span> · {fmt(e.createdAt)}</p>
      </header>

      <div className="od-grid">
        <div className="od-card">
          <h2 className="od-card__title">Customer</h2>
          <dl className="od-dl">
            <div><dt>Name</dt><dd>{[e.firstName, e.lastName].filter(Boolean).join(" ") || "—"}</dd></div>
            <div><dt>Email</dt><dd><a href={`mailto:${e.email}`} className="text-link">{e.email}</a></dd></div>
            {e.phone ? <div><dt>Phone</dt><dd>{e.phone}</dd></div> : null}
            {e.orderNumber ? <div><dt>Order</dt><dd className="admin__mono">{e.orderNumber}</dd></div> : null}
            <div><dt>Consent</dt><dd>{e.consent ? "Given" : "—"}</dd></div>
            {e.assigneeName ? <div><dt>Assigned</dt><dd>{e.assigneeName}</dd></div> : null}
          </dl>
        </div>
        <div className="od-card">
          <h2 className="od-card__title">Message</h2>
          <div className="enq-message">{(e.message || "").split("\n").map((l, i) => (l.trim() ? <p key={i} className="legal__p">{l}</p> : null))}</div>
        </div>
      </div>

      <section className="cfg-section">
        <h2 className="cfg-section__title">Manage</h2>
        <EnquiryManage id={e.id} status={e.status} nextStates={nextEnquiryStates(e.status)} assigneeName={e.assigneeName} adminNotes={e.adminNotes} canManage={canManage} />
      </section>

      <section className="cfg-section">
        <h2 className="cfg-section__title">Timeline</h2>
        <ul className="enq-timeline">
          <li><span className="enq-timeline__when">{fmt(e.createdAt)}</span><span>Enquiry received</span></li>
          {events.filter((ev) => ev.kind !== "created").map((ev) => (
            <li key={ev.id}><span className="enq-timeline__when">{fmt(ev.createdAt)}</span><span>{ev.detail}{ev.actorName ? ` · ${ev.actorName}` : ""}</span></li>
          ))}
        </ul>
        <p className="cfg-hint">Reply history &amp; reply-by-email are a future phase — this module stores enquiries only.</p>
      </section>
    </main>
  );
}
