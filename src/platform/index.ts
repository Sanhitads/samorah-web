/**
 * Platform models — the data-model layer (build-order step 2).
 *
 * Framework-agnostic: no React / Next.js imports anywhere in this layer — these
 * are pure types (+ the `emitEvent` seam and the `CURRENT_DESIGN_SYSTEM` const),
 * so the same models can power web, a future mobile app, POS or services.
 * Principle: API before Interface; Domains remain independent.
 *
 * The engines (theme system, section registry/renderer/shell, template engine,
 * resolvers) and the typed page/section configs build on these in later steps.
 * See `docs/PAGE_ARCHITECTURE.md` and `docs/ARCHITECTURAL_PRINCIPLES.md`.
 */
export * from "./primitives";
export * from "./theme";
export * from "./taxonomy";
export * from "./asset";
export * from "./navigation";
export * from "./content";
export * from "./relationships";
export * from "./relationshipTypes";
export * from "./section";
export * from "./page";
export * from "./commerce";
export * from "./observability";
