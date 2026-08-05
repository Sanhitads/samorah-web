/**
 * Shared SEO mutation helper (SEO Phase 2 · point 22). One confirmation-loop client used by BOTH
 * /admin/seo and PageSeoPanel so they share the SAME server-enforced validation + confirmation
 * semantics — a strong-warning save (major-route noindex, cross-domain canonical) returns a
 * confirmation, we ask via `confirm`, then retry with `confirmed:true`. No parallel logic per surface.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PostSeoResult { ok: boolean; data: any }

export async function postSeo(body: Record<string, unknown>, confirm: (messages: string[]) => boolean): Promise<PostSeoResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const send = (b: Record<string, unknown>) => fetch("/api/admin/seo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(async (r) => ({ r, d: (await r.json()) as any }));
  try {
    let { r, d } = await send(body);
    if ((!r.ok || d.ok === false) && d.analysis?.confirmations?.length) {
      if (confirm(d.analysis.confirmations)) ({ r, d } = await send({ ...body, confirmed: true }));
      else return { ok: false, data: { cancelled: true } };
    }
    return { ok: r.ok && d.ok !== false, data: d };
  } catch { return { ok: false, data: { error: "Network error" } }; }
}
