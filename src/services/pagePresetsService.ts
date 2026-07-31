/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Page presets + seasonal homepages (Phase 7 · points 29/30). Editors save a whole page composition as
 * a named preset ("Christmas Homepage", "Launch Homepage", …) optionally tagged with a season, then
 * clone it into the draft or **activate** it (publish) with one click. Stored as a single row in the
 * generic `settings` key/value table (key `page_presets`) — no migration, mirroring the Section Library.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import type { ComposedSection } from "@/services/pageComposerService";

function loose() { return createAdminClient() as unknown as { from: (t: string) => any }; }
const KEY = "page_presets";

/** Seasonal slots offered as one-click presets (point 29). "Default" is the everyday homepage. */
export const SEASONS = ["Default", "Autumn", "Summer", "Christmas", "Diwali", "Launch"] as const;
export type Season = (typeof SEASONS)[number];

export interface PagePreset {
  id: string;
  name: string;
  season: string;      // one of SEASONS, or "" for an untagged preset
  pageKey: string;
  sections: ComposedSection[];
  createdAt: string;
}

async function readAll(): Promise<PagePreset[]> {
  try {
    const db = loose();
    const { data } = await db.from("settings").select("value").eq("key", KEY).maybeSingle();
    return Array.isArray(data?.value) ? (data.value as PagePreset[]) : [];
  } catch { return []; }
}

async function writeAll(list: PagePreset[]): Promise<{ ok: boolean; reason?: string }> {
  const db = loose();
  const { error } = await db.from("settings").upsert(
    { key: KEY, value: list, section: "content", label: "Homepage presets & seasons", updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  return error ? { ok: false, reason: error.message } : { ok: true };
}

export async function listPagePresets(pageKey?: string): Promise<PagePreset[]> {
  const all = (await readAll()).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return pageKey ? all.filter((p) => p.pageKey === pageKey) : all;
}

export async function getPagePreset(id: string): Promise<PagePreset | null> {
  return (await readAll()).find((p) => p.id === id) ?? null;
}

export async function savePagePreset(input: { pageKey: string; name: string; season?: string; sections: ComposedSection[] }, actorId?: string): Promise<{ ok: boolean; id?: string; reason?: string; presets?: PagePreset[] }> {
  const name = (input.name || "").trim();
  if (!name) return { ok: false, reason: "A preset name is required." };
  if (!input.pageKey) return { ok: false, reason: "Missing page." };
  if (!Array.isArray(input.sections)) return { ok: false, reason: "Missing sections." };
  const season = SEASONS.includes(input.season as Season) ? input.season! : "";
  const list = await readAll();
  const id = `preset-${Math.random().toString(36).slice(2, 9)}`;
  const entry: PagePreset = { id, name: name.slice(0, 80), season, pageKey: input.pageKey, sections: input.sections, createdAt: new Date().toISOString() };
  const next = [entry, ...list].slice(0, 60);
  const res = await writeAll(next);
  if (!res.ok) return res;
  await logEvent({ entityType: "settings", event: "page_preset.saved", actorType: actorId ? "staff" : "system", actorId, notes: `${name}${season ? ` · ${season}` : ""} (${input.pageKey})` });
  return { ok: true, id, presets: await listPagePresets(input.pageKey) };
}

export async function deletePagePreset(id: string, pageKey: string, actorId?: string): Promise<{ ok: boolean; reason?: string; presets?: PagePreset[] }> {
  const list = await readAll();
  const next = list.filter((p) => p.id !== id);
  const res = next.length === list.length ? { ok: true } : await writeAll(next);
  if (!res.ok) return res;
  await logEvent({ entityType: "settings", event: "page_preset.deleted", actorType: actorId ? "staff" : "system", actorId, notes: id });
  return { ok: true, presets: await listPagePresets(pageKey) };
}
