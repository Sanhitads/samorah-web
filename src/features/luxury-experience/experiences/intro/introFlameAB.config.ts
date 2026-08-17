/**
 * PROTOTYPE ONLY — Phase 2.1 Signature Flame Adoption · A/B harness. REMOVE before freeze (Commit 4).
 *
 * Switches the intro's flame between:
 *   • Mode "A" — the original CSS flame (`.lux-intro__flame`), completely untouched.
 *   • Mode "B" — the adopted Flame Primitive (`variant="match"`) inside the intro's ignition wrapper.
 *
 * Default "A" → the intro renders exactly as before; nothing changes in production. Only ONE mode ever
 * renders — the two intros are NEVER shown simultaneously (experience, don't diff). This is temporary
 * review infrastructure for the emotional-parity review and must not ship — it is deleted in Commit 4.
 *
 * To review: set mode "B", reset the intro (localStorage.removeItem('samorah:lux-intro')), reload; then
 * back to "A" and repeat. Compare one at a time (see SIGNATURE_FLAME_ADOPTION.md).
 */
export const INTRO_FLAME_AB: { mode: "A" | "B" } = { mode: "A" };
