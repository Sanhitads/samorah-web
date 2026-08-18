# Phase 3.4 — Scroll Breathe Validation · Browser Review (capture matrix)

Artifacts for the human browser/emotional review. **No code, no tuning** happens to prepare these — the
harness is technically frozen at Commit 1 (`95aefa2`). This folder holds the capture checklist + the verdict
template; drop the captured PNGs alongside using the names below.

## How to run the harness (temporary, uncommitted)
The harness is deliberately **not routed**. To view it, create a throwaway local route and delete it after —
never commit it (same pattern as the Cursor Bend review):

**1. Create** `src/app/dev-scroll-breathe/page.tsx`:
```tsx
// TEMPORARY — local review only. DO NOT COMMIT. Delete after review.
import { ScrollBreatheProbe } from "@/features/luxury-experience/experiences/_validation/scrollBreathe/ScrollBreatheProbe";

export default function DevScrollBreathePage() {
  return (
    <main style={{ minHeight: "100vh", background: "#0e0b08" }}>
      <ScrollBreatheProbe />
    </main>
  );
}
```
**2. Run** `npm run dev` → open **http://localhost:3000/dev-scroll-breathe**. The page is tall (300vh); the
light stays centred (fixed) while you scroll past it.
**3. Delete** the route when done: `rm src/app/dev-scroll-breathe/page.tsx`.

## Screenshot checklist (8 shots)
Capture the light's centre; scroll states are: **start** (top, at rest), **mid** (actively scrolling — breath
at its subtle dip), **idle** (stopped ~1s — returned to full).

| # | File | Device | Theme | Scroll state |
|---|---|---|---|---|
| 1 | `desktop-dark-start.png` | Desktop | Dark | Scroll start |
| 2 | `desktop-dark-mid.png` | Desktop | Dark | Scroll mid |
| 3 | `desktop-dark-idle.png` | Desktop | Dark | Scroll idle |
| 4 | `desktop-light.png` | Desktop | Light | Scroll start |
| 5 | `mobile-dark-mid.png` | Mobile | Dark | Scroll mid |
| 6 | `mobile-dark-idle.png` | Mobile | Dark | Scroll idle |
| 7 | `mobile-light.png` | Mobile | Light | Scroll start |
| 8 | `reduced-motion.png` | Desktop | Dark | Reduced-motion ON (must be fully static) |

**Dimensions covered:** Desktop · Mobile · Light · Dark · Scroll start · Scroll mid · Scroll idle (+ the
reduced-motion governor shot).

## What to watch (not tuning — observing)
- The **mid** vs **idle** shots should be **hard to tell apart** — the breath is a sub-perceptual dip, not a pulse.
- The light must **return to full** when scrolling stops (idle == start), smoothly, with **no bounce**.
- On **mobile / touch**, scrolling still works (no fine pointer required); the breath should read the same.
- With **reduced motion**, there must be **no breath at all** (static light).

## Sequence after capture
1. Capture the 8 shots.  2. Complete `VERDICT.md` (all six gates).  3. If **every** gate passes → Commit 2
(Adopt). 4. If **one** gate fails → record Observed Differences → **exactly one** targeted tuning pass →
re-review → only then adopt. **No repeated tweaking.**
