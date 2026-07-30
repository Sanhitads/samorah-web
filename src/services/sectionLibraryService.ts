/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Reusable Section Library (Homepage Builder · Phase 2 · point 9). Editors save a finished section
 * ("Holiday Hero", "Launch Banner", …) once and drop it into ANY composed page. Stored as a single
 * row in the generic `settings` key/value table (key `section_library`) — no migration. Each entry
 * keeps the section `type` + a deep copy of its `settings`. Every change is audited.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";

function loose() { return createAdminClient() as unknown as { from: (t: string) => any }; }
const KEY = "section_library";

export interface SectionTemplateEntry {
  id: string;
  name: string;
  type: string;
  settings: Record<string, unknown>;
  createdAt: string;
}

async function readAll(): Promise<SectionTemplateEntry[]> {
  try {
    const db = loose();
    const { data } = await db.from("settings").select("value").eq("key", KEY).maybeSingle();
    const v = data?.value;
    return Array.isArray(v) ? (v as SectionTemplateEntry[]) : [];
  } catch { return []; }
}

async function writeAll(list: SectionTemplateEntry[]): Promise<{ ok: boolean; reason?: string }> {
  const db = loose();
  const { error } = await db.from("settings").upsert(
    { key: KEY, value: list, section: "content", label: "Reusable section library", updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  return error ? { ok: false, reason: error.message } : { ok: true };
}

export async function listSectionTemplates(): Promise<SectionTemplateEntry[]> {
  return (await readAll()).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function saveSectionTemplate(input: { name: string; type: string; settings: Record<string, unknown> }, actorId?: string, nowIso?: string): Promise<{ ok: boolean; id?: string; reason?: string }> {
  const name = (input.name || "").trim();
  if (!name) return { ok: false, reason: "A name is required." };
  if (!input.type) return { ok: false, reason: "Missing section type." };
  const list = await readAll();
  // Strip section-management metadata so a saved template is a clean, reusable block.
  const settings = { ...(input.settings ?? {}) };
  for (const k of ["__state", "__from", "__until"]) delete (settings as Record<string, unknown>)[k];
  const id = `lib-${Math.random().toString(36).slice(2, 9)}`;
  const entry: SectionTemplateEntry = { id, name: name.slice(0, 80), type: input.type, settings, createdAt: nowIso ?? new Date().toISOString() };
  const next = [entry, ...list].slice(0, 200); // sane cap
  const res = await writeAll(next);
  if (!res.ok) return res;
  await logEvent({ entityType: "settings", event: "section_library.saved", actorType: actorId ? "staff" : "system", actorId, notes: `${name} (${input.type})` });
  return { ok: true, id };
}

export async function deleteSectionTemplate(id: string, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const list = await readAll();
  const next = list.filter((e) => e.id !== id);
  if (next.length === list.length) return { ok: true }; // already gone
  const res = await writeAll(next);
  if (!res.ok) return res;
  await logEvent({ entityType: "settings", event: "section_library.deleted", actorType: actorId ? "staff" : "system", actorId, notes: id });
  return { ok: true };
}
