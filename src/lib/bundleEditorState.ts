/**
 * Bundle editor state machine (P1B) — the pure three-state model the Admin editor uses:
 *   published        — the live storefront config (or null when never published)
 *   saved            — the last PERSISTED draft (the Discard baseline)
 *   draft            — the LOCAL, possibly-unsaved editing config
 * All transitions are pure so the editor's behaviour is unit-pinned rather than relying on JSX.
 * `dirty` (draft ≠ saved) drives the beforeunload guard and the "Unsaved edits" indicator.
 */
import { DEFAULT_BUNDLE_CONFIG, type BundleConfig } from "@/lib/bundleConfig";

export interface EditorState {
  draft: BundleConfig;
  saved: BundleConfig;
  published: BundleConfig | null;
}

const clone = (c: BundleConfig): BundleConfig => JSON.parse(JSON.stringify(c));
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export const isDirty = (s: EditorState): boolean => !eq(s.draft, s.saved);
export const publicationLabel = (s: EditorState): "Never published" | "Published — live" | "Draft changes not published" =>
  !s.published ? "Never published" : eq(s.saved, s.published) ? "Published — live" : "Draft changes not published";

/** A local field edit — only the draft changes. */
export const afterEdit = (s: EditorState, draft: BundleConfig): EditorState => ({ ...s, draft: clone(draft) });
/** Discard unsaved edits — revert draft to the last persisted draft (client-only, no live change). */
export const afterDiscard = (s: EditorState): EditorState => ({ ...s, draft: clone(s.saved) });
/** Save draft — the saved (Discard) baseline becomes the current draft; published untouched. */
export const afterSave = (s: EditorState): EditorState => ({ ...s, saved: clone(s.draft) });
/** Reset draft to default — draft AND saved become DEFAULT; published (live) unchanged until Publish. */
export const afterReset = (s: EditorState): EditorState => ({ draft: clone(DEFAULT_BUNDLE_CONFIG), saved: clone(DEFAULT_BUNDLE_CONFIG), published: s.published });
/** Publish — the current draft becomes live; draft+saved re-baseline to it. */
export const afterPublish = (s: EditorState): EditorState => ({ draft: clone(s.draft), saved: clone(s.draft), published: clone(s.draft) });
/** Restore a revision into the draft — draft+saved become the restored config; published unchanged. */
export const afterRestoreToDraft = (s: EditorState, restored: BundleConfig): EditorState => ({ ...s, draft: clone(restored), saved: clone(restored) });
/** Restore + publish — the restored config becomes live and the new baseline. */
export const afterRestorePublish = (_s: EditorState, restored: BundleConfig): EditorState => ({ draft: clone(restored), saved: clone(restored), published: clone(restored) });
