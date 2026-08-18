# Phase 3.2 — Visual Review Artifacts (Signature Intro Ambient Illumination)

Reference screenshots for the emotional review of the intro ambient illumination, kept so future engineers
can compare against the approved baseline.

> **Note:** these PNGs are captured by a human at a real browser — they cannot be generated headlessly.
> This file is the capture checklist + the folder they live in.

## Required matrix (8 shots) — capture Mode A and Mode B
Run: set `mode: "B"` (the value → `= { mode: "B" }`) in
`src/features/luxury-experience/experiences/intro/introAmbientAB.config.ts`, `npm run build && npm run start`,
reset the intro (`localStorage.removeItem('samorah:lux-intro')`), reload. Then back to `"A"` for Mode A.

| File | Mode | Device | Background |
|---|---|---|---|
| `mode-a-desktop-dark.png` | A | Desktop | Dark |
| `mode-a-desktop-light.png` | A | Desktop | Light |
| `mode-a-mobile-dark.png` | A | Mobile | Dark |
| `mode-a-mobile-light.png` | A | Mobile | Light |
| `mode-b-desktop-dark.png` | B | Desktop | Dark |
| `mode-b-desktop-light.png` | B | Desktop | Light |
| `mode-b-mobile-dark.png` | B | Mobile | Dark |
| `mode-b-mobile-light.png` | B | Mobile | Light |

Capture at the flame's peak (≈ ignition/hold) so Mode A vs Mode B is comparable. Drop the PNGs here.

## Layer order (front → back)
**Spark · Flame · AmbientLight · Background.** Phase 3.2's invariant (asserted in
`intro/ambientLayerOrder.test.ts`): **AmbientLight is behind both the Flame and the Spark, in front of the
Background** (it is the backmost overlay). The Spark/Flame relative stacking is inherited from the frozen
Phase 2.1 intro and is not altered by Phase 3.2.
