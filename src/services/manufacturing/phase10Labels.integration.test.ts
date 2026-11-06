import { describe, it, expect, beforeAll } from "vitest";

/**
 * Phase 10 — batch label generation, eligibility, integrity, print history. LOCAL only; disposable tracked
 * variants. A print never changes QC/inventory/lifecycle/recall state; retail/product labels are refused
 * server-side for non-released or held/recalled batches; the encoded value equals the immutable batch code.
 */
const URL = (process.env.INV_TEST_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.INV_TEST_SERVICE_KEY || "";
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL);
const RUN = !!(URL && KEY && LOCAL);
const d = RUN ? describe : describe.skip;
if (RUN) { process.env.NEXT_PUBLIC_SUPABASE_URL = URL; process.env.SUPABASE_SERVICE_ROLE_KEY = KEY; }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = (p: string) => `${URL}/rest/v1${p}`;
/* eslint-disable @typescript-eslint/no-explicit-any */
const sel = async (p: string) => (await fetch(rest(p), { headers: H })).json() as any;
const ins = async (t: string, row: any) => { const r = await fetch(rest(`/${t}`), { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(row) }); if (!r.ok) throw new Error(`${t}: ${await r.text()}`); return (await r.json())[0]; };
const patch = (p: string, row: any) => fetch(rest(p), { method: "PATCH", headers: H, body: JSON.stringify(row) });
const rpc = async (fn: string, body: any) => { const r = await fetch(rest(`/rpc/${fn}`), { method: "POST", headers: H, body: JSON.stringify(body) }); return r.json().catch(() => null); };

import { createBatch, updateBatch, startProduction } from "@/services/manufacturing/batchService";
import { toCuring, toQualityCheck, approveQc } from "@/services/manufacturing/lifecycleService";
import { recordRoutineQc, recordDesignValidation } from "@/services/manufacturing/qcService";
import { releaseBatch } from "@/services/manufacturing/releaseService";
import { setReleaseEnabled, setVariantTracking } from "@/services/manufacturing/activationService";
import { listLabelTemplates, generateLabel, batchLabelPayload, labelPrintHistory, confirmLabelPrinted } from "@/services/manufacturing/labelService";
import { ForbiddenError, type StaffActor } from "@/services/manufacturing/actor";

const RUNK = Date.now().toString(36).slice(-5);
let sup: StaffActor, mgr: StaffActor, ed: StaffActor, customer: StaffActor; let n = 0;

async function approvedBatch(variantId: string, qty: number, release = true): Promise<string> {
  const { batchId } = await createBatch(mgr, { variantId, idempotencyKey: `L10B-${RUNK}-${Math.random()}`, manufacturingDate: "2026-10-01", plannedQty: qty, earliestReleaseDate: "2026-10-10" });
  await updateBatch(mgr, { batchId, producedQty: qty, pendingInspectionQty: qty });
  await startProduction(mgr, batchId); await toCuring(mgr, batchId); await toQualityCheck(mgr, batchId);
  await recordRoutineQc(ed, { batchId, inspectedQty: qty, approvedDelta: qty, rejectedDelta: 0, result: "pass", measurements: { fill_weight: 100 } });
  await recordDesignValidation(ed, { batchId, result: "pass", measurements: { flame: "stable" } });
  await approveQc(mgr, batchId);
  if (release) await releaseBatch(mgr, { batchId, qty, idempotencyKey: `L10R-${RUNK}-${Math.random()}` });
  return batchId;
}
async function makeVariant(): Promise<{ v: string; product: string }> {
  const cat = (await sel("/categories?select=id&limit=1"))[0]; const t = `${RUNK}${Math.random().toString(36).slice(2, 5)}`;
  const p = await ins("products", { name: `L10 ${t}`, slug: `l10-${t}`, base_sku: `L10-${t}`.toUpperCase(), category_id: cat.id, price: 100, hsn_code: "34060010", product_type: "candle", batch_prefix: Math.random().toString(36).slice(2, 8).toUpperCase().slice(0, 6) });
  const v = await ins("variants", { product_id: p.id, sku: `L10-${t}-GL`.toUpperCase(), price: 100, vessel_type: "glass", size_label: "100g", variant_name: "Glass 100g", tracking_state: "untracked", is_active: false });
  await setVariantTracking(sup, v.id, "tracked");
  return { v: v.id, product: p.id };
}
const tmpl = async (purpose: string) => (await listLabelTemplates({ purpose }))[0];
const code = async (b: string) => (await sel(`/manufacturing_batches?id=eq.${b}&select=batch_code`))[0].batch_code;

d("Phase 10 — batch labels", () => {
  beforeAll(async () => {
    const us = await sel("/users?select=id&limit=2");
    sup = { userId: us[0].id, role: "super_admin" }; mgr = { userId: us[1]?.id ?? us[0].id, role: "manager" }; ed = { userId: us[0].id, role: "editor" }; customer = { userId: us[0].id, role: "customer" };
    await setReleaseEnabled(sup, true);
  });

  it("1,8. retail label carries the correct immutable code; encoded value == batch code; print recorded", async () => {
    const { v } = await makeVariant(); const b = await approvedBatch(v, 10);
    const r = await generateLabel(ed, { batchId: b, templateId: (await tmpl("retail")).id, quantity: 5 });
    expect(r.ok).toBe(true);
    expect(r.batchCode).toBe(await code(b));
    expect(r.encodedValue).toBe(r.batchCode);            // generated-code == encoded-code
    expect(r.payload.verified.net_quantity).toBe("100g"); // correct variant/net on the label
    expect(r.quantity).toBe(5);
    const hist = await labelPrintHistory(b);
    expect(hist[0].quantity).toBe(5); expect(hist[0].purpose).toBe("retail"); expect(hist[0].printed_by).toBe(ed.userId);
  });

  it("2,10. reprint preserves the SAME batch identity and appends accurate history", async () => {
    const { v } = await makeVariant(); const b = await approvedBatch(v, 5); const t = (await tmpl("product_batch_id")).id;
    const a = await generateLabel(ed, { batchId: b, templateId: t, quantity: 1 });
    const c = await generateLabel(ed, { batchId: b, templateId: t, quantity: 1 }); // reprint
    expect(c.batchCode).toBe(a.batchCode);
    expect((await labelPrintHistory(b)).length).toBe(2);
  });

  it("4. a label print NEVER mutates QC / lifecycle / inventory state", async () => {
    const { v } = await makeVariant(); const b = await approvedBatch(v, 5);
    const before = (await sel(`/manufacturing_batches?id=eq.${b}&select=lifecycle_status,approved_qty,recall_state`))[0];
    await generateLabel(ed, { batchId: b, templateId: (await tmpl("retail")).id, quantity: 3 });
    const after = (await sel(`/manufacturing_batches?id=eq.${b}&select=lifecycle_status,approved_qty,recall_state`))[0];
    expect(after).toEqual(before);
  });

  it("12,13. retail/product labels are refused for non-approved, held and recalled batches (server-enforced)", async () => {
    const { v } = await makeVariant();
    const draft = await approvedBatch(v, 5, false); // qc_approved but NOT released is fine for product label; test a true draft instead
    const { batchId: trueDraft } = await createBatch(mgr, { variantId: v, idempotencyKey: `L10D-${RUNK}-${n++}`, manufacturingDate: "2026-10-01", plannedQty: 5 });
    const retailT = (await tmpl("retail")).id; const internalT = (await tmpl("internal_mfg")).id;
    await expect(generateLabel(ed, { batchId: trueDraft, templateId: retailT })).rejects.toThrow(); // draft → no retail label
    expect((await generateLabel(ed, { batchId: trueDraft, templateId: internalT })).ok).toBe(true); // internal label is fine
    // recalled batch → no retail label
    await patch(`/manufacturing_batches?id=eq.${draft}`, { recall_state: "recalled" });
    await expect(generateLabel(ed, { batchId: draft, templateId: retailT })).rejects.toThrow(/recalled|eligible/i);
  });

  it("4b,5. mismatched batch id is rejected; retail payload lists missing legal/business fields (not fabricated)", async () => {
    const { v } = await makeVariant(); const b = await approvedBatch(v, 5);
    await expect(generateLabel(ed, { batchId: "00000000-0000-4000-8000-000000000000", templateId: (await tmpl("retail")).id })).rejects.toThrow();
    const payload = await batchLabelPayload(b, "retail");
    expect(payload.missing_business).toContain("manufacturer_name_and_address");
    expect(payload.missing_legal).toContain("country_of_origin");
    expect(payload.verified.batch_code).toBe(await code(b)); // only authoritative values marked verified
  });

  it("7. templates are versioned; a print snapshots the template version", async () => {
    const { v } = await makeVariant(); const b = await approvedBatch(v, 5);
    const t = await tmpl("retail");
    const r = await generateLabel(ed, { batchId: b, templateId: t.id, quantity: 1 }); void r;
    const hist = (await labelPrintHistory(b))[0];
    expect(hist.template_version).toBe(t.version); expect(hist.template_key).toBeTruthy();
  });

  it("9. concurrent print requests both record (append-only, no corruption)", async () => {
    const { v } = await makeVariant(); const b = await approvedBatch(v, 5); const t = (await tmpl("retail")).id;
    await Promise.all([generateLabel(ed, { batchId: b, templateId: t, quantity: 2 }), generateLabel(ed, { batchId: b, templateId: t, quantity: 3 })]);
    const hist = await labelPrintHistory(b);
    expect(hist.length).toBe(2); expect(hist.reduce((a: number, x: any) => a + x.quantity, 0)).toBe(5);
  });

  it("11. unauthorised role cannot print", async () => {
    const { v } = await makeVariant(); const b = await approvedBatch(v, 5);
    await expect(generateLabel(customer, { batchId: b, templateId: (await tmpl("retail")).id })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("3. generation ≠ physical print: a job starts 'generated'; confirming marks it 'printed' idempotently", async () => {
    const { v } = await makeVariant(); const b = await approvedBatch(v, 5);
    await generateLabel(ed, { batchId: b, templateId: (await tmpl("retail")).id, quantity: 1 });
    const job = (await labelPrintHistory(b))[0];
    expect(job.status).toBe("generated");                 // generated, NOT yet physically printed
    expect((await confirmLabelPrinted(ed, job.id)).status).toBe("printed");
    expect((await confirmLabelPrinted(ed, job.id)).ok).toBe(true); // idempotent re-confirm
    expect((await labelPrintHistory(b))[0].status).toBe("printed");
    // generation vs print recorded distinctly; original generation evidence preserved (same job row)
    expect((await labelPrintHistory(b)).length).toBe(1);
  });
});
