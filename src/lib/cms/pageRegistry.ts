/**
 * Composable Page Registry (review point 6) — the generic framework that turns
 * "the Homepage Builder" into "a page builder." A PAGE TYPE (homepage, about,
 * journal, landing…) registers the section types it can compose; each section
 * declares a schema (fields) + a config-derived defaults provider. Nothing here is
 * homepage-specific — Homepage is simply consumer #1.
 *
 * No functionality change vs before: the same section definitions, now addressable
 * through a reusable registry so a second page type is a registration, not a rewrite.
 */
import type { SectionSchema } from "./sectionSchema";

export interface SectionDefinition {
  schema: SectionSchema;
  /** Current content from config/entities — the baseline before any DB edit. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defaults: (ctx?: any) => Record<string, unknown>;
}

export interface PageType {
  key: string;                 // "homepage" | "about" | "journal" | …
  label: string;
  sections: Record<string, SectionDefinition>;
}

const REGISTRY = new Map<string, PageType>();

export function registerPageType(pt: PageType): PageType {
  REGISTRY.set(pt.key, pt);
  return pt;
}
export function getPageType(key: string): PageType | undefined { return REGISTRY.get(key); }
export function listPageTypes(): PageType[] { return [...REGISTRY.values()]; }

/** Convenience — a page type's schemas keyed by section type. */
export function schemasOf(key: string): Record<string, SectionSchema> {
  const pt = REGISTRY.get(key);
  if (!pt) return {};
  return Object.fromEntries(Object.entries(pt.sections).map(([t, d]) => [t, d.schema]));
}
