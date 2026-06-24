// Fragrance domain — pure functions over fragrance data. Two shapes feed in:
//   • product `fragrance_notes` rows (layer = top | heart | base) from the DB
//   • curated FragranceFamily entries (notes = opening | heart | base) from JSON
// The scent pyramid is top → middle(heart) → base; "middle" and "heart" are the
// same layer, exposed under both names for readable call sites.

import type { FragranceFamily } from "@/services/fragranceService";

// ── Family lookup ─────────────────────────────────────────────────────────────

/** Find a fragrance family by id within a list. */
export function findFamily(
  families: FragranceFamily[],
  id: string,
): FragranceFamily | undefined {
  return families.find((f) => f.id === id);
}

// ── Note grouping (product fragrance_notes rows) ─────────────────────────────

export interface NoteRow {
  layer: string;
  note: string;
  sort_order?: number | null;
}

export interface GroupedNotes {
  top: string[];
  heart: string[];
  base: string[];
}

/** Group flat product note rows into the scent pyramid, preserving sort order. */
export function groupNotes(rows: NoteRow[] | null | undefined): GroupedNotes {
  const grouped: GroupedNotes = { top: [], heart: [], base: [] };
  const sorted = [...(rows ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  for (const row of sorted) {
    if (row.layer === "top" || row.layer === "heart" || row.layer === "base") {
      grouped[row.layer].push(row.note);
    }
  }
  return grouped;
}

/** Top (opening) notes from product note rows. */
export function topNotes(rows: NoteRow[] | null | undefined): string[] {
  return groupNotes(rows).top;
}

/** Middle notes — the heart layer — from product note rows. */
export function middleNotes(rows: NoteRow[] | null | undefined): string[] {
  return groupNotes(rows).heart;
}

/** Base notes from product note rows. */
export function baseNotes(rows: NoteRow[] | null | undefined): string[] {
  return groupNotes(rows).base;
}

// ── Family notes (curated FragranceFamily) ───────────────────────────────────

/** A family's notes mapped to the pyramid (its `opening` becomes `top`). */
export function familyNotes(family: FragranceFamily): GroupedNotes {
  return {
    top: family.notes.opening,
    heart: family.notes.heart,
    base: family.notes.base,
  };
}
