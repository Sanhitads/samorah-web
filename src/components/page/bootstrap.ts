/**
 * Platform bootstrap — populate the section + template registries before any
 * template-driven page renders. Both underlying calls are idempotent, so this
 * is safe to invoke on every render (PageView does). The committed homepage,
 * which renders its components directly, does not need this.
 */
import { registerSectionLibrary } from "@/components/sections/sectionLibrary";
import { registerCoreTemplates } from "@/platform/coreTemplates";

export function bootstrapPlatform(): void {
  registerSectionLibrary();
  registerCoreTemplates();
}
