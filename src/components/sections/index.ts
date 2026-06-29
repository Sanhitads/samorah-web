/**
 * Section Engine (§16) — the composition core: shell · registry · renderer ·
 * the reusable section library, and the block registry/renderer. Built on the
 * platform's section model (`@/platform/section`).
 */
export * from "./registry";
export * from "./SectionShell";
export * from "./SectionRenderer";
export * from "./SectionErrorBoundary";
export * from "./sectionLibrary";
export * from "./blocks/registry";
export * from "./blocks/BlockRenderer";
