"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Reorder } from "framer-motion";
import type { PageAdminView, ComposedSection } from "@/services/pageComposerService";
import type { Revision } from "@/services/cms/revisions";
import { validateContent, type SectionSchema } from "@/lib/cms/sectionSchema";
import type { MediaOption, EntityOptions } from "./SchemaForm";
import { LivePreviewPanel } from "./LivePreviewPanel";
import { PageBuilderSectionRow } from "./PageBuilderSectionRow";
import { AddSectionModal } from "./AddSectionModal";
import { PageSeoPanel, type PageSeo } from "./PageSeoPanel";
import { PerformancePanel } from "./PerformancePanel";
import { SectionAnalyticsPanel } from "./SectionAnalyticsPanel";
import { AccessibilityPanel } from "./AccessibilityPanel";
import { PresetsPanel } from "./PresetsPanel";
import { AuditTimelinePanel } from "./AuditTimelinePanel";
import type { PagePreset } from "@/services/pagePresetsService";
import type { PageAuditEntry } from "@/services/pageAuditService";
import type { HomepagePerformance } from "@/services/analytics/performanceService";
import type { SectionStat } from "@/services/analytics/sectionAnalyticsService";
import { enabledForState, effectiveSectionState, type SectionState } from "@/lib/cms/sectionState";
import { useHistoryState } from "@/hooks/useHistoryState";

export type SectionTemplate = { id: string; label: string; description: string; type: string; settings: Record<string, unknown>; comingSoon: boolean };
export type LibraryEntry = { id: string; name: string; type: string; settings: Record<string, unknown>; createdAt: string };

type Meta = { type: string; label: string; note: string };
const DEVICES = [{ k: "desktop", label: "Desktop", w: "100%" }, { k: "tablet", label: "Tablet", w: "820px" }, { k: "mobile", label: "Mobile", w: "390px" }] as const;
const toLocal = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);
function move<T>(arr: T[], i: number, dir: number): T[] {
  const j = i + dir; if (j < 0 || j >= arr.length) return arr;
  const next = [...arr]; [next[i], next[j]] = [next[j], next[i]]; return next;
}
// Per-section fingerprint for the save-status badges (content only — position/order is a list concern).
const sectionKey = (s: ComposedSection) => JSON.stringify({ type: s.type, enabled: s.enabled, settings: s.settings });
const fingerprints = (list: ComposedSection[]) => Object.fromEntries(list.map((s) => [s.id, sectionKey(s)]));
const PREVIEW_SRC = "samorah-pdp-preview"; // shared postMessage tag (LivePreviewPanel + preview routes)

export function PageBuilder({ pageKey, label, view, sectionMeta, schemas, media, entities = {}, templates = [], library: libraryProp = [], previewPath, previewCookie, livePreviewSrc, seo, seoOrigin, perf, analytics, presets: presetsProp = [], audit: auditProp = [] }: {
  pageKey: string; label: string; view: PageAdminView; sectionMeta: Meta[]; schemas: Record<string, SectionSchema>; media: MediaOption[]; entities?: EntityOptions; templates?: SectionTemplate[]; library?: LibraryEntry[]; previewPath: string; previewCookie: string; livePreviewSrc?: string; seo?: PageSeo; seoOrigin?: string; perf?: HomepagePerformance; analytics?: Record<string, SectionStat>; presets?: PagePreset[]; audit?: PageAuditEntry[];
}) {
  const router = useRouter();
  const apiBase = `/api/admin/pages/${pageKey}`;
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null);
  const [sections, setSections, history] = useHistoryState<ComposedSection[]>(view.draft, { limit: 120 });
  const [pubAt, setPubAt] = useState(toLocal(view.publishAt));
  const [unpubAt, setUnpubAt] = useState(toLocal(view.unpublishAt));
  const [openSet, setOpenSet] = useState<Set<string>>(new Set());       // expanded section ids (accordion)
  const [focusId, setFocusId] = useState<string | null>(null);          // active section → preview scrolls to it
  const [flashId, setFlashId] = useState<string | null>(null);          // editor row flash on preview→editor nav
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());   // sections mid-save (badge shows "Saving…")
  const [, forceTick] = useState(0);                                    // refresh badges after a save
  const [revs, setRevs] = useState<Revision[] | null>(null);
  const [device, setDevice] = useState<string | null>(null);
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [autosavedAt, setAutosavedAt] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryEntry[]>(libraryProp);
  const [showAdd, setShowAdd] = useState(false);      // Add-section picker modal
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [saveLibFor, setSaveLibFor] = useState<number | null>(null); // section index being saved to the library
  const [libName, setLibName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());   // sections chosen for selective publish (point 13)
  const [previewRev, setPreviewRev] = useState<{ label: string; snapshot: ComposedSection[] } | null>(null); // point 15 preview
  const [compareRev, setCompareRev] = useState<{ label: string; added: string[]; removed: string[]; changed: string[] } | null>(null);
  const [mounted, setMounted] = useState(false);      // gate framer Reorder to the client (avoids an SSR hydration mismatch)
  useEffect(() => setMounted(true), []);
  const [search, setSearch] = useState("");           // #19 find section / find content
  const labelOf = (t: string) => sectionMeta.find((m) => m.type === t)?.label ?? t;
  // Match a section by its name/type OR any of its content values (point 19).
  const sectionMatches = (s: ComposedSection) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${labelOf(s.type)} ${s.type}`.toLowerCase().includes(q) || JSON.stringify(s.settings ?? {}).toLowerCase().includes(q);
  };
  // Field edits coalesce into one undo step per (section,key) run of ~1.2s — typing is one undo, not per-key.
  const setField = (i: number, key: string, value: unknown) => setSections((s) => s.map((x, j) => (j === i ? { ...x, settings: { ...x.settings, [key]: value } } : x)), `field:${i}:${key}`);

  // Per-section save status (point 2) — compare each section's current fingerprint to its last-saved one.
  const savedById = useRef<Record<string, string>>(fingerprints(view.draft));
  const markSaved = (list: ComposedSection[]) => { savedById.current = fingerprints(list); forceTick((n) => n + 1); };
  const isDirty = (s: ComposedSection) => savedById.current[s.id] !== sectionKey(s);
  const statusOf = (s: ComposedSection) => (savingIds.has(s.id) ? { t: "saving", l: "Saving…" } : isDirty(s) ? { t: "unsaved", l: "● Unsaved" } : { t: "saved", l: "✓ Saved" });

  // Per-section validation (point 11) — field-level errors from the schema (required/length/url/blocks),
  // surfaced live. The full cross-field rules still run server-side on publish.
  const errorsOf = (s: ComposedSection): string[] => { const sc = schemas[s.type]; if (!sc) return []; try { return validateContent(sc, s.settings ?? {}); } catch { return []; } };
  // Publishing state badge (point 12) — Published/Draft/Hidden/Scheduled/Expired/Archived.
  const publishStatusById = view.publishStatusById ?? {};
  const effStateOf = (s: ComposedSection) => effectiveSectionState(s.settings, { publishStatus: publishStatusById[s.id], dirty: isDirty(s) });

  // Accordion (point 4) — opening one collapses the others; Expand/Collapse All override it.
  const toggleSection = (id: string) => {
    setOpenSet((prev) => { const next = new Set(prev); if (next.has(id) && next.size === 1) next.clear(); else { next.clear(); next.add(id); } return next; });
    setFocusId(id);
  };
  const expandAll = () => setOpenSet(new Set(sections.map((s) => s.id)));
  const collapseAll = () => setOpenSet(new Set());

  // Renumber sortOrder from current array order before sending.
  const withOrder = () => sections.map((s, i) => ({ ...s, sortOrder: i }));

  const sectionsRef = useRef(sections);
  useEffect(() => { sectionsRef.current = sections; }, [sections]);
  const lastSaved = useRef(JSON.stringify(view.draft.map((s, i) => ({ ...s, sortOrder: i }))));
  const snapshot = () => JSON.stringify(sectionsRef.current.map((s, i) => ({ ...s, sortOrder: i })));

  // Content lock (heartbeat) + autosave — both on a 30s tick (review points 8, 9).
  const resource = `page:${pageKey}`;
  const readOnly = !!lockedBy;                 // another editor holds the lock (point 34)
  const lockedByRef = useRef(lockedBy); lockedByRef.current = lockedBy;
  // "Take over editing" (point 34): forcibly reassign the lock to me, then edit. Reports clearly when it
  // can't (an expired session returns 401/403 — silently doing nothing looked like the button was broken).
  const [takingOver, setTakingOver] = useState(false);
  const takeOver = async () => {
    setTakingOver(true);
    try {
      const res = await fetch("/api/admin/locks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "steal", resource }) });
      if (res.status === 401 || res.status === 403) { setMsg({ tone: "err", text: "Couldn't take over — your session has expired. Refresh the page and sign in again." }); return; }
      const r = await res.json().catch(() => ({}));
      if (r.ok) { setLockedBy(null); setMsg({ tone: "ok", text: "You're now editing — the other editor goes read-only on their next check." }); }
      else { setMsg({ tone: "err", text: r.error ?? "Couldn't take over editing." }); }
    } catch { setMsg({ tone: "err", text: "Couldn't take over editing — network error. Try again." }); }
    finally { setTakingOver(false); }
  };
  useEffect(() => {
    let alive = true;
    const lock = async () => {
      try {
        const r = await (await fetch("/api/admin/locks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resource }) })).json();
        if (alive) setLockedBy(r.ok ? null : r.heldBy ?? "another editor");
      } catch { /* ignore */ }
    };
    const autosave = async () => {
      if (lockedByRef.current) return;         // never autosave over another editor's work while read-only
      const cur = snapshot();
      if (cur === lastSaved.current) return; // nothing changed since last save
      try {
        const d = await (await fetch(apiBase, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", sections: JSON.parse(cur) }) })).json();
        if (alive && d.ok !== false) { lastSaved.current = cur; markSaved(sectionsRef.current); setAutosavedAt(new Date().toLocaleTimeString()); }
      } catch { /* retry next tick */ }
    };
    lock();
    const t = setInterval(() => { lock(); autosave(); }, 30_000);
    const release = () => { navigator.sendBeacon?.("/api/admin/locks", new Blob([JSON.stringify({ action: "release", resource })], { type: "application/json" })); };
    // Dirty-state warning (point 3): release the lock, and warn the browser only when there are unsaved edits.
    const onBeforeUnload = (e: BeforeUnloadEvent) => { release(); if (snapshot() !== lastSaved.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => { alive = false; clearInterval(t); release(); window.removeEventListener("beforeunload", onBeforeUnload); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, resource]);

  // Preview → Editor (point 1): a click in the live preview opens + scrolls + flashes that section here.
  useEffect(() => {
    const origin = window.location.origin;
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== origin || e.data?.source !== PREVIEW_SRC || e.data.kind !== "navigate") return;
      const id = String(e.data.id);
      setOpenSet(new Set([id])); setFocusId(id); setFlashId(id);
      setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 1600);
      requestAnimationFrame(() => { try { document.querySelector(`[data-sid="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }); } catch { /* ignore */ } });
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // In-app navigation guard (point 3): confirm before leaving to another admin page while dirty. Capture
  // phase beats the Next <Link> handler; only same-origin, path-changing, non-blank links are guarded.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (snapshot() === lastSaved.current) return;
      const a = (e.target as HTMLElement)?.closest?.("a") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || a.target === "_blank" || a.hasAttribute("download")) return;
      let url: URL; try { url = new URL(a.href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      if (!window.confirm("You have unsaved homepage changes. Leave without saving?")) { e.preventDefault(); e.stopPropagation(); }
    };
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll / position memory (point 5) — restore expanded section + editor scroll; persist on change/unload.
  const posKey = `pb-pos:${pageKey}`;
  const openSetRef = useRef(openSet); openSetRef.current = openSet;
  useEffect(() => {
    try {
      const st = JSON.parse(sessionStorage.getItem(posKey) || "{}");
      if (Array.isArray(st.open) && st.open.length) { setOpenSet(new Set(st.open as string[])); setFocusId(st.open[0]); }
      if (typeof st.scrollY === "number") requestAnimationFrame(() => window.scrollTo(0, st.scrollY));
    } catch { /* ignore */ }
    const persist = () => { try { sessionStorage.setItem(posKey, JSON.stringify({ open: [...openSetRef.current], scrollY: window.scrollY })); } catch { /* ignore */ } };
    window.addEventListener("beforeunload", persist);
    return () => { persist(); window.removeEventListener("beforeunload", persist); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { try { const prev = JSON.parse(sessionStorage.getItem(posKey) || "{}"); sessionStorage.setItem(posKey, JSON.stringify({ ...prev, open: [...openSet] })); } catch { /* ignore */ } }, [openSet, posKey]);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(apiBase, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); setBusy(false);
      if (!res.ok || d.ok === false) { setMsg({ tone: "err", text: d.error ?? d.reason ?? "Failed" }); return d; }
      startTransition(() => router.refresh()); return d;
    } catch { setBusy(false); setMsg({ tone: "err", text: "Network error" }); return null; }
  };

  const save = async () => {
    setSavingIds(new Set(sections.filter(isDirty).map((s) => s.id)));
    const d = await post({ action: "save", sections: withOrder() });
    setSavingIds(new Set());
    if (d?.ok) { lastSaved.current = snapshot(); markSaved(sections); setMsg({ tone: "ok", text: "Draft saved." }); }
  };
  const [warns, setWarns] = useState<string[]>([]);
  const publish = async () => {
    setWarns([]);
    const d = await post({ action: "publish", sections: withOrder(), publishAt: fromLocal(pubAt), unpublishAt: fromLocal(unpubAt) });
    if (Array.isArray(d?.warnings)) setWarns(d.warnings);
    if (d?.ok) setMsg({ tone: "ok", text: pubAt ? "Scheduled." : "Published live." });
    else if (Array.isArray(d?.errors) && d.errors.length) setWarns(d.errors);
  };
  const reset = async () => { const d = await post({ action: "reset" }); if (d?.ok) setMsg({ tone: "ok", text: "Reset to default." }); };
  const openRevs = async () => { const d = await post({ action: "revisions" }); if (d?.revisions) setRevs(d.revisions); };
  const restore = async (id: string) => { const d = await post({ action: "restore", id }); if (d?.ok) { setRevs(null); setMsg({ tone: "ok", text: "Restored into draft — review, then publish." }); } };
  const restoreLive = async (id: string) => { const d = await post({ action: "restore.publish", id }); if (d?.ok) { setRevs(null); setPreviewRev(null); setMsg({ tone: "ok", text: "Restored and published live." }); } };

  // Presets + seasonal homepages (points 29/30).
  const [presets, setPresets] = useState<PagePreset[]>(presetsProp);
  const savePreset = async (name: string, season: string) => { const d = await post({ action: "preset.save", name, season, sections: withOrder() }); if (d?.presets) setPresets(d.presets); if (d?.ok) setMsg({ tone: "ok", text: `Saved preset "${name}".` }); };
  const deletePreset = async (id: string) => { const d = await post({ action: "preset.delete", id }); if (d?.presets) setPresets(d.presets); };
  const applyPreset = (secs: ComposedSection[]) => { setSections(secs); setOpenSet(new Set()); setMsg({ tone: "ok", text: "Preset loaded into the draft — review, then Save or Publish." }); };
  const activatePreset = async (secs: ComposedSection[]) => { setSections(secs); const d = await post({ action: "publish", sections: secs.map((s, i) => ({ ...s, sortOrder: i })) }); if (d?.ok) setMsg({ tone: "ok", text: "Preset activated — published live." }); };

  // Audit timeline (point 35).
  const [audit, setAudit] = useState<PageAuditEntry[]>(auditProp);
  const refreshAudit = async () => { const d = await post({ action: "audit.timeline" }); if (Array.isArray(d?.audit)) setAudit(d.audit); };

  // Selective publish (point 13) — publish only the ticked sections.
  const toggleSelect = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clearSelect = () => setSelected(new Set());
  const publishSelected = async () => {
    const ids = [...selected];
    if (!ids.length) { setMsg({ tone: "err", text: "Tick the sections you want to publish." }); return; }
    setWarns([]);
    const d = await post({ action: "publish.sections", sections: withOrder(), sectionIds: ids });
    if (Array.isArray(d?.errors)) setWarns(d.errors);
    if (d?.ok) { lastSaved.current = snapshot(); markSaved(sections); setSelected(new Set()); setMsg({ tone: "ok", text: `Published ${ids.length} section${ids.length === 1 ? "" : "s"} live.` }); }
  };

  // Version history — Preview a revision in the live panel; Compare it to the current draft (point 15).
  const previewRevision = async (r: Revision) => { const d = await post({ action: "revision.get", id: r.id }); if (Array.isArray(d?.snapshot)) { setPreviewRev({ label: r.label ?? new Date(r.createdAt).toLocaleString(), snapshot: d.snapshot as ComposedSection[] }); setRevs(null); } };
  const compareRevision = async (r: Revision) => {
    const d = await post({ action: "revision.get", id: r.id });
    if (!Array.isArray(d?.snapshot)) return;
    const old = d.snapshot as ComposedSection[];
    const oldById = new Map(old.map((s) => [s.id, sectionKey(s)]));
    const curById = new Map(sections.map((s) => [s.id, sectionKey(s)]));
    const added: string[] = [], removed: string[] = [], changed: string[] = [];
    for (const s of sections) if (!oldById.has(s.id)) added.push(labelOf(s.type));
    for (const s of old) if (!curById.has(s.id)) removed.push(labelOf(s.type));
    for (const s of sections) { const o = oldById.get(s.id); if (o !== undefined && o !== curById.get(s.id)) changed.push(labelOf(s.type)); }
    setCompareRev({ label: r.label ?? new Date(r.createdAt).toLocaleString(), added, removed, changed });
  };
  // Preview is URL-driven (?preview=1) — self-limiting, so the live URL is never
  // "stuck" in preview. We save the draft first so the preview reflects the latest edits.
  const previewUrl = `${previewPath}${previewPath.includes("?") ? "&" : "?"}preview=1`;
  const [previewKey, setPreviewKey] = useState(0);
  const previewAt = async (deviceKey: string) => {
    await post({ action: "save", sections: withOrder() });
    setDevice(deviceKey); setPreviewKey((k) => k + 1);
  };
  const previewNewTab = async () => { await post({ action: "save", sections: withOrder() }); window.open(previewUrl, "_blank", "noopener"); };

  // ── Section management (Phase 2) ────────────────────────────────────────────────────────────────
  const uid = (type: string) => `${type || "section"}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v ?? {}));
  const moveSection = (i: number, dir: -1 | 1) => setSections((x) => move(x, i, dir));

  // point 7 — status drives visibility (enabled derived); scheduling lives in settings.__from/__until.
  const setStatus = (i: number, state: SectionState) =>
    setSections((s) => s.map((x, j) => (j === i ? { ...x, enabled: enabledForState(state), settings: { ...x.settings, __state: state } } : x)));
  const setSchedule = (i: number, key: "__from" | "__until", val: string) =>
    setSections((s) => s.map((x, j) => (j === i ? { ...x, settings: { ...x.settings, [key]: val } } : x)));

  // point 6 — duplicate: copy type + status + all settings into a fresh id, inserted right after.
  const duplicateSection = (i: number) => setSections((s) => {
    const src = s[i]; const copy: ComposedSection = { id: uid(src.type), type: src.type, enabled: src.enabled, sortOrder: 0, settings: clone(src.settings) };
    const next = [...s.slice(0, i + 1), copy, ...s.slice(i + 1)]; return next;
  });

  // point 8/9 — insert a blank type, a starter template, or a saved library block.
  const insertSection = (type: string, settings: Record<string, unknown> = {}) => {
    const id = uid(type);
    setSections((s) => [...s, { id, type, enabled: true, sortOrder: s.length, settings: clone(settings) }]);
    setOpenSet(new Set([id])); setFocusId(id);
  };

  const askRemove = (id: string) => setConfirmDel(id);
  const removeSection = (i: number) => { setSections((x) => x.filter((_, j) => j !== i)); setConfirmDel(null); };

  // point 9 — save a section to the reusable library (named via an in-app modal), and manage entries.
  const openSaveLib = (i: number) => { setSaveLibFor(i); setLibName(labelOf(sections[i].type)); };
  const confirmSaveLib = async () => {
    if (saveLibFor === null) return;
    const s = sections[saveLibFor]; const name = libName.trim();
    if (!s || !name) return;
    const d = await post({ action: "library.save", name, type: s.type, settings: s.settings });
    if (d?.ok && Array.isArray(d.library)) { setLibrary(d.library as LibraryEntry[]); setSaveLibFor(null); setMsg({ tone: "ok", text: `Saved “${name}” to your library.` }); }
  };
  const deleteLibraryEntry = async (id: string) => {
    const d = await post({ action: "library.delete", id });
    if (d?.ok && Array.isArray(d.library)) setLibrary(d.library as LibraryEntry[]);
  };

  // Keyboard shortcuts (Phase 8) — Ctrl/Cmd+S save · Ctrl/Cmd+Z undo · Ctrl/Cmd+Shift+Z (or Ctrl+Y) redo
  // · Ctrl/Cmd+/ focus search · Esc close the top-most modal. A ref keeps the handler stable while always
  // seeing the latest state/functions.
  const searchRef = useRef<HTMLInputElement>(null);
  const kb = useRef<{ save: () => void; undo: () => void; redo: () => void; focusSearch: () => void; esc: () => void } | null>(null);
  kb.current = {
    save: () => { if (!readOnly) save(); },
    undo: history.undo,
    redo: history.redo,
    focusSearch: () => searchRef.current?.focus(),
    esc: () => { if (showAdd) setShowAdd(false); else if (revs) setRevs(null); else if (compareRev) setCompareRev(null); else if (saveLibFor !== null) setSaveLibFor(null); else if (previewRev) setPreviewRev(null); else if (confirmDel) setConfirmDel(null); },
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const t = e.target as HTMLElement | null;
      const typing = t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || !!t?.isContentEditable;
      const k = e.key.toLowerCase();
      if (mod && k === "s") { e.preventDefault(); kb.current?.save(); }
      else if (mod && k === "z" && !e.shiftKey) { if (!typing) { e.preventDefault(); kb.current?.undo(); } }
      else if (mod && (k === "y" || (k === "z" && e.shiftKey))) { if (!typing) { e.preventDefault(); kb.current?.redo(); } }
      else if (mod && e.key === "/") { e.preventDefault(); kb.current?.focusSearch(); }
      else if (e.key === "Escape") { kb.current?.esc(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={`cfg${livePreviewSrc ? " pb-live" : ""}`}>
      <div className={`pb-live__editor${readOnly ? " is-readonly" : ""}`}>
      {readOnly ? (
        <div className="pb-lockbar">
          <span>🔒 <b>Currently edited by {lockedBy}</b> — you're in read-only mode so you don't overwrite their work.</span>
          <button type="button" className="ff-btn ff-btn--mini ff-btn--primary" disabled={takingOver} onClick={takeOver}>{takingOver ? "Taking over…" : "Take over editing"}</button>
        </div>
      ) : null}
      {autosavedAt ? <p className="admin__muted" style={{ margin: "0 0 8px", fontSize: 12 }}>Autosaved at {autosavedAt}</p> : null}
      <div className="hp-toolbar">
        <span className="hp-toolbar__left">
          <input ref={searchRef} className="hp-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a section or content… (Ctrl+/)" aria-label="Find a section or content" />
          {search.trim() ? <span className="admin__muted">{sections.filter(sectionMatches).length} match{sections.filter(sectionMatches).length === 1 ? "" : "es"}</span> : <span className="admin__muted">{sections.length} sections</span>}
        </span>
        <span className="ff-actions">
          <button type="button" className="ff-btn ff-btn--mini" disabled={!history.canUndo} title="Undo (Ctrl+Z)" onClick={history.undo}>↶ Undo</button>
          <button type="button" className="ff-btn ff-btn--mini" disabled={!history.canRedo} title="Redo (Ctrl+Shift+Z)" onClick={history.redo}>↷ Redo</button>
          <button type="button" className="ff-btn ff-btn--mini" onClick={expandAll}>Expand all</button>
          <button type="button" className="ff-btn ff-btn--mini" onClick={collapseAll}>Collapse all</button>
          <button type="button" className="ff-btn ff-btn--primary" onClick={() => setShowAdd(true)}>+ Add section{library.length ? ` · ${library.length} saved` : ""}</button>
        </span>
      </div>
      {seo ? <PageSeoPanel path={previewPath} label={label} initial={seo} origin={seoOrigin ?? ""} media={media} /> : null}
      {analytics ? <SectionAnalyticsPanel stats={analytics} sections={sections.map((s) => ({ id: s.id, type: s.type, label: labelOf(s.type) }))} /> : null}
      {perf ? <PerformancePanel perf={perf} typeLabels={Object.fromEntries(sectionMeta.map((m) => [m.type, m.label]))} /> : null}
      <AccessibilityPanel sections={sections} schemas={schemas} labelOf={labelOf} onFocus={setFocusId} />
      <PresetsPanel presets={presets} currentSections={sections} busy={busy} onSave={savePreset} onDelete={deletePreset} onApply={applyPreset} onActivate={activatePreset} />
      <AuditTimelinePanel audit={audit} onRefresh={refreshAudit} labelOf={labelOf} />
      {(() => {
        const renderRow = (s: ComposedSection, i: number, draggable: boolean) => {
          const st = statusOf(s);
          return (
            <PageBuilderSectionRow
              key={s.id} draggable={draggable}
              section={s} index={i} total={sections.length}
              open={openSet.has(s.id)} focused={focusId === s.id} flashing={flashId === s.id}
              statusTone={st.t} statusLabel={st.l} note={sectionMeta.find((m) => m.type === s.type)?.note ?? ""} label={labelOf(s.type)}
              fields={schemas[s.type]?.fields ?? []} media={media} entities={entities} confirming={confirmDel === s.id}
              effState={effStateOf(s)} errors={errorsOf(s)} selected={selected.has(s.id)}
              dimmed={!!search.trim() && !sectionMatches(s)} matched={!!search.trim() && sectionMatches(s)}
              onFocus={setFocusId} onToggle={toggleSection} onField={setField} onSetState={setStatus} onSchedule={setSchedule}
              onDuplicate={duplicateSection} onSaveToLibrary={openSaveLib} onMove={moveSection} onToggleSelect={toggleSelect}
              onAskRemove={askRemove} onRemove={removeSection} onCancelRemove={() => setConfirmDel(null)}
            />
          );
        };
        // Static <ul> on the server + first client render (matches SSR); the draggable Reorder list is
        // swapped in after mount, so framer-motion's client-only drag styles never cause a mismatch.
        return mounted ? (
          <Reorder.Group axis="y" values={sections.map((s) => s.id)} onReorder={(ids) => setSections((prev) => (ids as string[]).map((id) => prev.find((s) => s.id === id)).filter(Boolean) as ComposedSection[])} className="hp-list">
            {sections.map((s, i) => renderRow(s, i, true))}
          </Reorder.Group>
        ) : (
          <ul className="hp-list">{sections.map((s, i) => renderRow(s, i, false))}</ul>
        );
      })()}

      {(() => {
        const invalid = sections.filter((s) => s.enabled && errorsOf(s).length);
        return (
          <div className="hp-pubbar">
            {invalid.length ? <span className="hp-pubbar__warn" title={invalid.map((s) => labelOf(s.type)).join(", ")}>⚠ {invalid.length} section{invalid.length === 1 ? "" : "s"} need attention before publishing</span> : <span className="admin__muted">✓ All sections valid</span>}
            {selected.size ? (
              <span className="ff-actions">
                <span className="admin__muted">{selected.size} selected</span>
                <button type="button" className="ff-btn ff-btn--primary" disabled={busy} onClick={publishSelected}>Publish selected</button>
                <button type="button" className="ff-btn ff-btn--mini" onClick={clearSelect}>Clear</button>
              </span>
            ) : <span className="admin__muted" style={{ fontSize: 12 }}>Tick ▢ a section to publish only that one</span>}
          </div>
        );
      })()}

      {warns.length ? <ul className="nav-warn">{warns.map((w, i) => <li key={i}>⚠ {w}</li>)}</ul> : null}

      <div className="nav-publish">
        <div className="cfg-grid">
          <label className="cfg-field"><span>Publish at (optional — schedule)</span><input type="datetime-local" value={pubAt} onChange={(e) => setPubAt(e.target.value)} /></label>
          <label className="cfg-field"><span>Unpublish at (optional)</span><input type="datetime-local" value={unpubAt} onChange={(e) => setUnpubAt(e.target.value)} /></label>
        </div>
        <div className="cfg-actions">
          <button type="button" className="ff-btn" disabled={busy || pending} onClick={save}>Save draft</button>
          {!livePreviewSrc ? DEVICES.map((d) => <button key={d.k} type="button" className="ff-btn" data-active={device === d.k ? "1" : "0"} disabled={busy} onClick={() => previewAt(d.k)}>{d.label}</button>) : null}
          <button type="button" className="ff-btn" disabled={busy} onClick={previewNewTab}>↗ tab</button>
          <button type="button" className="ff-btn ff-btn--primary" disabled={busy} onClick={publish}>{pubAt ? "Schedule" : "Publish"}</button>
          <button type="button" className="ff-btn" disabled={busy} onClick={openRevs}>History</button>
          {view.source === "db" ? <button type="button" className="ff-btn ff-btn--danger" disabled={busy} onClick={reset}>Reset to default</button> : null}
          {msg ? <span className={`cfg-msg cfg-msg--${msg.tone}`}>{msg.text}</span> : null}
        </div>
      </div>

      {!livePreviewSrc && device ? (
        <div className="hp-preview">
          <div className="hp-preview__bar">
            <span className="admin__muted">Draft preview · {DEVICES.find((d) => d.k === device)?.label}</span>
            {DEVICES.map((d) => <button key={d.k} type="button" className="ff-btn" data-active={device === d.k ? "1" : "0"} onClick={() => setDevice(d.k)}>{d.label}</button>)}
            <button type="button" className="ff-btn" onClick={() => setDevice(null)}>Close</button>
          </div>
          <div className="hp-preview__stage">
            <iframe key={previewKey} title={`${label} preview`} src={previewUrl} className="hp-preview__frame" style={{ width: DEVICES.find((d) => d.k === device)?.w, maxWidth: "100%" }} />
          </div>
        </div>
      ) : null}
      </div>{/* /pb-live__editor */}

      {livePreviewSrc ? (
        <div className="pb-live__preview">
          {previewRev ? (
            <div className="pb-revbanner">Previewing version · {previewRev.label}<button type="button" className="ff-btn ff-btn--mini" onClick={() => setPreviewRev(null)}>Exit preview</button></div>
          ) : null}
          <LivePreviewPanel src={livePreviewSrc} draft={previewRev ? previewRev.snapshot : sections} focusId={previewRev ? null : focusId} desktopWidth={1280} onRefresh={() => startTransition(() => router.refresh())} />
        </div>
      ) : null}

      {showAdd ? (
        <AddSectionModal
          templates={templates} library={library} blankTypes={sectionMeta}
          onInsert={(type, settings) => { insertSection(type, settings); setShowAdd(false); }}
          onDeleteLibrary={deleteLibraryEntry}
          onClose={() => setShowAdd(false)}
        />
      ) : null}

      {saveLibFor !== null ? (
        <div className="om-modal" role="dialog" aria-modal="true" aria-label="Save to library" onClick={() => setSaveLibFor(null)}>
          <div className="om-modal__card" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">Save to library</h2>
            <p className="om-modal__note">Save this {labelOf(sections[saveLibFor]?.type ?? "")} as a reusable block. You&apos;ll find it later under <b>+ Add section → Your library</b> on any page.</p>
            <label className="cfg-field"><span>Name</span>
              <input autoFocus value={libName} onChange={(e) => setLibName(e.target.value)} placeholder="e.g. Holiday Hero" maxLength={80}
                onKeyDown={(e) => { if (e.key === "Enter" && libName.trim() && !busy) confirmSaveLib(); }} />
            </label>
            {msg && msg.tone === "err" ? <p className="ff-err">{msg.text}</p> : null}
            <div className="om-modal__actions">
              <button type="button" className="ff-btn" disabled={busy} onClick={() => setSaveLibFor(null)}>Cancel</button>
              <button type="button" className="ff-btn ff-btn--primary" disabled={busy || !libName.trim()} onClick={confirmSaveLib}>{busy ? "Saving…" : "Save to library"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {revs ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => setRevs(null)}>
          <div className="om-modal__card om-modal__card--wide" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">Version history · {label}</h2>
            <p className="om-modal__note"><b>Preview</b> a version, <b>Compare</b> what it would change, <b>Restore to draft</b> (review before publishing), or <b>Restore & publish live</b> to put it straight back on the live page.</p>
            {revs.length ? (
              <ul className="rev-list">{revs.map((r) => (
                <li key={r.id} className="rev-item rev-item--wide">
                  <span className="rev-item__when">{new Date(r.createdAt).toLocaleString()}</span>
                  <span className="rev-item__meta admin__muted">{r.label ?? "full publish"}</span>
                  <span className="ff-actions">
                    <button type="button" className="ff-btn ff-btn--mini" disabled={busy} onClick={() => previewRevision(r)}>Preview</button>
                    <button type="button" className="ff-btn ff-btn--mini" disabled={busy} onClick={() => compareRevision(r)}>Compare</button>
                    <button type="button" className="ff-btn ff-btn--mini" disabled={busy} onClick={() => restore(r.id)}>Restore to draft</button>
                    <button type="button" className="ff-btn ff-btn--primary ff-btn--mini" disabled={busy} onClick={() => restoreLive(r.id)}>Restore &amp; publish live</button>
                  </span>
                </li>
              ))}</ul>
            ) : <p className="admin__empty">No published versions yet.</p>}
            <div className="om-modal__actions"><button type="button" className="ff-btn" onClick={() => setRevs(null)}>Close</button></div>
          </div>
        </div>
      ) : null}

      {compareRev ? (
        <div className="om-modal" role="dialog" aria-modal="true" aria-label="Compare version" onClick={() => setCompareRev(null)}>
          <div className="om-modal__card" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">Compare · {compareRev.label}</h2>
            <p className="om-modal__note">What restoring this version would change vs your current draft:</p>
            {compareRev.added.length || compareRev.removed.length || compareRev.changed.length ? (
              <ul className="rev-diff">
                {compareRev.removed.map((n, i) => <li key={`r${i}`} className="rev-diff__row" data-k="rm"><span>− Restoring removes</span> {n}</li>)}
                {compareRev.added.map((n, i) => <li key={`a${i}`} className="rev-diff__row" data-k="add"><span>+ Restoring adds back</span> {n}</li>)}
                {compareRev.changed.map((n, i) => <li key={`c${i}`} className="rev-diff__row" data-k="chg"><span>~ Restoring changes</span> {n}</li>)}
              </ul>
            ) : <p className="admin__muted">Identical — this version matches your current draft.</p>}
            <div className="om-modal__actions"><button type="button" className="ff-btn" onClick={() => setCompareRev(null)}>Close</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
