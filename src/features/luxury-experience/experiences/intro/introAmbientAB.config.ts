/**
 * PROTOTYPE ONLY — Phase 3.2 (Signature Intro Ambient Illumination) A/B harness, built FRESH against
 * Ambient Lighting Engine **v1.1**. REMOVE before adopt/freeze.
 *
 *   • Mode "A" — the frozen Phase 2.1 intro, byte-identical (default).
 *   • Mode "B" — the intro PLUS a composed, now-VISIBLE ambient illumination behind the flame (v1.1 fixed
 *     the self-referential color, so the light renders with a real warm colour).
 *
 * Only ONE mode ever renders — the two versions are never shown at once. Default "A" → production is
 * untouched. Nothing is adopted or removed by this harness. See SIGNATURE_INTRO_AMBIENT_ILLUMINATION.md.
 */
export const INTRO_AMBIENT_AB: { mode: "A" | "B" } = { mode: "A" };
