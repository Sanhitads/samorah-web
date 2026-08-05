import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Phase 1 · Email Templates — draft→publish invariants against the real DB.
 * Proves the locked safety rule: SAVING A DRAFT NEVER CHANGES WHAT CUSTOMERS RECEIVE (the send path
 * reads only the published scalars), publish validates→promotes→clears-draft and records history, an
 * invalid draft cannot be published, and reset disables the override so the coded default resumes.
 * Uses `order.cancelled` as a sandbox; the original row is snapshotted and fully restored. Env-gated.
 */
try {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* skip below */ }

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUN = !!(URL && KEY);
const d = RUN ? describe : describe.skip;
const H = { apikey: KEY!, Authorization: `Bearer ${KEY!}`, "Content-Type": "application/json" };
const rest = (path: string) => fetch(`${URL}/rest/v1/${path}`, { headers: H }).then((r) => r.json());

const K = "order.cancelled";
let svc: typeof import("@/services/emailTemplateService");
let original: any = null;
let preRevs = new Set<string>();

beforeAll(async () => {
  if (!RUN) return;
  svc = await import("@/services/emailTemplateService");
  original = (await rest(`email_templates?key=eq.${K}&select=*`))?.[0] ?? null;
  const revs = await rest(`cms_revisions?resource_type=eq.email&resource_key=eq.${K}&select=id`);
  preRevs = new Set((revs ?? []).map((r: any) => r.id));
});
afterAll(async () => {
  if (!RUN) return;
  // Restore the exact original row (or delete the sandbox row if there was none).
  if (original) await fetch(`${URL}/rest/v1/email_templates?key=eq.${K}`, { method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ ...original }) });
  else await fetch(`${URL}/rest/v1/email_templates?key=eq.${K}`, { method: "DELETE", headers: H });
  const revs = await rest(`cms_revisions?resource_type=eq.email&resource_key=eq.${K}&select=id`);
  const mine = (revs ?? []).map((r: any) => r.id).filter((id: string) => !preRevs.has(id));
  if (mine.length) await fetch(`${URL}/rest/v1/cms_revisions?id=in.(${mine.join(",")})`, { method: "DELETE", headers: H });
});

d("email templates — draft/publish safety (real DB)", () => {
  it("saving a draft does NOT change the published send-path version", async () => {
    // Start from a known published baseline.
    await svc.saveEmailTemplateDraft(K, { subject: "PUBLISHED baseline {{orderNumber}}", blocks: [], enabled: true });
    await svc.publishEmailTemplate(K);
    const before = await svc.getEmailTemplate(K); // send path
    expect(before?.subject).toBe("PUBLISHED baseline {{orderNumber}}");

    await svc.saveEmailTemplateDraft(K, { subject: "DRAFT edit {{orderNumber}}" });
    const afterSave = await svc.getEmailTemplate(K); // send path must be UNCHANGED
    expect(afterSave?.subject).toBe("PUBLISHED baseline {{orderNumber}}");

    const admin = await svc.getEmailTemplateAdmin(K);
    expect(admin?.status).toBe("draft");
    expect(admin?.draft.subject).toBe("DRAFT edit {{orderNumber}}");
  });

  it("an invalid draft (unknown token) cannot be published; published version is untouched", async () => {
    await svc.saveEmailTemplateDraft(K, { subject: "Bad {{ordreNumber}}" });
    const res = await svc.publishEmailTemplate(K);
    expect(res.ok).toBe(false);
    expect((res.errors ?? []).some((e) => /ordreNumber/.test(e))).toBe(true);
    const send = await svc.getEmailTemplate(K);
    expect(send?.subject).toBe("PUBLISHED baseline {{orderNumber}}"); // still the last good publish
  });

  it("publishing a valid draft promotes it, clears the draft, and records a revision", async () => {
    const revsBefore = (await svc.listEmailRevisions(K)).length;
    await svc.saveEmailTemplateDraft(K, { subject: "Now live {{orderNumber}}" });
    const res = await svc.publishEmailTemplate(K);
    expect(res.ok).toBe(true);
    const send = await svc.getEmailTemplate(K);
    expect(send?.subject).toBe("Now live {{orderNumber}}"); // send path now sees it
    const admin = await svc.getEmailTemplateAdmin(K);
    expect(admin?.status).toBe("published"); // draft cleared
    expect((await svc.listEmailRevisions(K)).length).toBe(revsBefore + 1);
  });

  it("restore pulls a past revision into the DRAFT (non-destructive — published stays)", async () => {
    const revs = await svc.listEmailRevisions(K);
    expect(revs.length).toBeGreaterThan(0);
    const publishedBefore = (await svc.getEmailTemplate(K))?.subject;
    await svc.restoreEmailRevision(K, revs[0].id);
    const send = await svc.getEmailTemplate(K);
    expect(send?.subject).toBe(publishedBefore); // published unchanged by a restore-to-draft
    const admin = await svc.getEmailTemplateAdmin(K);
    expect(admin?.status).toBe("draft");
  });

  // Closure invariant: production=PUBLISHED, Preview & Send Test=DRAFT — through the SAME canonical
  // renderer (renderTemplateContent, exactly as the route's send-test/preview actions call it) and the
  // production send renderer (renderAuthoredEmail). No parallel renderer. Proves saving/testing a draft
  // never promotes it or alters the published content.
  it("A published → draft B: production renders A, Send Test renders B, then publish B → production renders B", async () => {
    const def = svc.EMAIL_TEMPLATE_DEFS.find((x) => x.key === K)!;
    const vars = { orderNumber: "O-1", name: "Nadia" };
    const details = "<tr><td>DETAILS</td></tr>";

    // Publish A (authored body so both subject AND body are verifiable).
    await svc.saveEmailTemplateDraft(K, { subject: "SUBJECT A {{orderNumber}}", blocks: [{ type: "paragraph", text: "BODY A {{name}}" }], enabled: true });
    expect((await svc.publishEmailTemplate(K)).ok).toBe(true);

    // Production send path = A.
    const prodA = await svc.renderAuthoredEmail(K, vars);
    expect(prodA?.subject).toContain("SUBJECT A");
    expect(prodA?.html).toContain("BODY A");

    // Save draft B — DO NOT publish.
    await svc.saveEmailTemplateDraft(K, { subject: "SUBJECT B {{orderNumber}}", blocks: [{ type: "paragraph", text: "BODY B {{name}}" }] });

    // Production send path STILL A (saving a draft never changes what customers receive).
    const prodStill = await svc.renderAuthoredEmail(K, vars);
    expect(prodStill?.subject).toContain("SUBJECT A");
    expect(prodStill?.html).toContain("BODY A");
    expect(prodStill?.html).not.toContain("BODY B");

    // Send Test renders the operator's current editor content (draft + any unsaved edits) via the same
    // renderTemplateContent as production preview. Here there are no unsaved edits, so it equals the
    // saved draft B — proving the test reflects B while production still renders A.
    const admin = await svc.getEmailTemplateAdmin(K);
    const c = admin!.draft ?? admin!.published;
    const test = svc.renderTemplateContent(def, c, def.sample, details);
    expect(test.subject).toContain("SUBJECT B");
    expect(test.html).toContain("BODY B");
    expect(test.html).not.toContain("BODY A");

    // Published row is untouched by the draft save + test render (no promotion).
    expect((await svc.getEmailTemplate(K))?.subject).toBe("SUBJECT A {{orderNumber}}");

    // Publish B → production now renders B.
    expect((await svc.publishEmailTemplate(K)).ok).toBe(true);
    const prodB = await svc.renderAuthoredEmail(K, vars);
    expect(prodB?.subject).toContain("SUBJECT B");
    expect(prodB?.html).toContain("BODY B");
    expect(prodB?.html).not.toContain("BODY A");
  });

  it("reset disables the override so the coded default resumes on the send path", async () => {
    await svc.resetEmailTemplate(K);
    const send = await svc.getEmailTemplate(K);
    expect(send?.enabled).toBe(false); // send path skips the authored/override → coded builder used
    const subj = await svc.resolveSubject(K, "CODED DEFAULT SUBJECT", { orderNumber: "X" });
    expect(subj).toBe("CODED DEFAULT SUBJECT"); // disabled override → falls back to the coded default
  });
});
