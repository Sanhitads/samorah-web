import { requireCapability } from "@/lib/auth/requireStaff";
import { getEnquiriesQueue } from "@/services/enquiryService";

/** GET /api/admin/enquiries/export — CSV of all enquiries. data.export. */
export const runtime = "nodejs";

const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET() {
  const staff = await requireCapability("data.export");
  if (!staff.ok) return new Response("Forbidden — data.export required.", { status: 403 });

  const rows = await getEnquiriesQueue({ limit: 5000 });
  const header = ["Number", "Received", "Status", "First name", "Last name", "Email", "Phone", "Subject", "Order number", "Assigned to", "Message"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([r.number, r.createdAt, r.status, r.firstName, r.lastName, r.email, r.phone, r.subject, r.orderNumber, r.assigneeName, (r.message || "").replace(/\s*\n+\s*/g, " ")].map(esc).join(","));
  }
  return new Response("﻿" + lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="customer-enquiries.csv"' },
  });
}
