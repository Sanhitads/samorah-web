import type { ReactNode } from "react";
import type {
  SectionType,
  SectionInstance,
  BlockInstance,
} from "@/platform/section";
import type { RenderContext } from "@/platform/render";

/**
 * Section Registry (§16) — maps a section `type` to its component, with a rich
 * manifest the future CMS visual editor reads directly (no extra config): the
 * capability matrix, category, render cost, permissions, emitted events, a
 * validation schema and reserved plugin hooks.
 *
 * Principles: Composition over Templates; Every Component CMS-ready.
 */
export interface SectionComponentProps {
  settings: Record<string, unknown>;
  variant: string;
  blocks?: BlockInstance[];
  section: SectionInstance;
  /** Page · campaign · experience · theme · navigation — resolved once, passed in. */
  context: RenderContext;
}

export type SectionComponent = (props: SectionComponentProps) => ReactNode;

// — higher-level grouping for the CMS palette —
export type SectionCategory =
  | "narrative"
  | "commerce"
  | "media"
  | "navigation"
  | "conversion"
  | "legal"
  | "interactive"
  | "structure";

/** What a section type supports — the CMS derives its editing UI from this. */
export interface SectionCapabilities {
  blocks?: boolean;
  variants?: boolean;
  background?: boolean;
  theme?: boolean;
  assets?: boolean;
  animation?: boolean;
  relationships?: boolean;
  seo?: boolean;
  analytics?: boolean;
  localization?: boolean;
  scheduling?: boolean;
  personalization?: boolean;
  abTesting?: boolean;
}

/** Performance budget — the page builder can warn on too many heavy sections. */
export type RenderCost = "light" | "medium" | "heavy";

// — CMS editing roles (distinct from the storefront RBAC) [Future] —
export type CmsRole = "administrator" | "editor" | "marketing" | "designer";
export interface SectionPermissions {
  edit?: CmsRole[];
  publish?: CmsRole[];
}

// — validation: flag incomplete sections before publishing —
export interface ValidationIssue {
  field?: string;
  message: string;
}
export type SectionValidator = (
  settings: Record<string, unknown>,
) => ValidationIssue[];

// — plugin extension points [Future — declared, not yet invoked] —
export interface SectionHookContext {
  section: SectionInstance;
  context: RenderContext;
}
export interface SectionHooks {
  beforeResolve?: (ctx: SectionHookContext) => void;
  afterResolve?: (ctx: SectionHookContext) => void;
  beforeRender?: (ctx: SectionHookContext) => void;
  afterRender?: (ctx: SectionHookContext) => void;
}

export interface SectionDefinition {
  type: SectionType;
  component: SectionComponent;
  variants?: string[];
  defaultEnvelope?: Partial<
    Pick<SectionInstance, "themeToken" | "spacing" | "animation" | "layout">
  >;
  // — manifest —
  displayName?: string;
  category?: SectionCategory;
  description?: string;
  icon?: string;
  capabilities?: SectionCapabilities;
  renderCost?: RenderCost;
  permissions?: SectionPermissions; // [Future]
  /** Analytics events this section emits (e.g. "cta-click", "image-click"). [Future] */
  emits?: string[];
  validate?: SectionValidator;
  hooks?: SectionHooks; // [Future]
}

/** A section's manifest without the runtime functions — safe for a CMS to read. */
export type SectionManifest = Omit<
  SectionDefinition,
  "component" | "validate" | "hooks"
>;

const REGISTRY = new Map<string, SectionDefinition>();

export function registerSection(def: SectionDefinition): void {
  REGISTRY.set(def.type, def);
}

export function getSectionDefinition(
  type: SectionType,
): SectionDefinition | undefined {
  return REGISTRY.get(type);
}

export function hasSection(type: SectionType): boolean {
  return REGISTRY.has(type);
}

export function registeredSectionTypes(): SectionType[] {
  return [...REGISTRY.keys()];
}

/** The manifests the CMS visual editor reads (no components/functions). */
export function getSectionManifests(): SectionManifest[] {
  return [...REGISTRY.values()].map((d) => ({
    type: d.type,
    variants: d.variants,
    defaultEnvelope: d.defaultEnvelope,
    displayName: d.displayName,
    category: d.category,
    description: d.description,
    icon: d.icon,
    capabilities: d.capabilities,
    renderCost: d.renderCost,
    permissions: d.permissions,
    emits: d.emits,
  }));
}

/** Validate a section's settings against its registered schema (publish-time). */
export function validateSection(section: SectionInstance): ValidationIssue[] {
  const def = REGISTRY.get(section.type);
  return def?.validate ? def.validate(section.settings) : [];
}
