/**
 * Page Engine (UI layer) — render a resolved `Page` and derive its metadata.
 * The framework-agnostic resolution lives in `@/platform/pageResolver`.
 */
export { PageView } from "./PageView";
export { buildPageMetadata } from "./pageMetadata";
export { bootstrapPlatform } from "./bootstrap";
