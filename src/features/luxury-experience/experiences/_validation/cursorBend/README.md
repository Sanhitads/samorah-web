# Cursor Bend Validation — isolation harness (Phase 3.3)

**Prove-in-isolation only. Not routed. Not imported by any production experience.** Delete the folder to
remove it (`git revert`); nothing else changes.

## What this proves
The approved chain, using **only frozen public APIs**:

```
createFlameLightSource → resolveAmbientLight() → <AmbientLight>     (all untouched)
        + Cursor Bend driver → experience-owned --lux-bend-* transform wrapper
```

The cursor bend lives **entirely in this validation layer**. No Ambient Lighting Engine, Flame Primitive,
Composition Layer, or Experience Engine file is modified. No new public API is added. The Match Strike Intro
is not touched.

## Movement Budget (permanent constraint)
> The maximum positional bend produced by cursor input must remain within a small, predefined limit relative
> to the light radius, so the effect is perceptible only subconsciously and never reads as an object
> following the cursor.

Enforced in [`movementBudget.ts`](./movementBudget.ts) (`clampToBudget`, cap **±6px ≈ ≤ ~4 % of the premium
light radius**) — in this layer, requiring **no** engine change. Registered as a permanent platform rule in
`docs/LUXURY_PLATFORM.md`.

## Files
| File | Role |
|---|---|
| `movementBudget.ts` | the permanent bound + `clampToBudget` |
| `cursorBendDriver.ts` | frozen `LightDriver` impl (`position` channel only); `computeBend` (pure) + passive, rAF-coalesced pointer signal |
| `CursorBendProbe.tsx` | the isolated harness: composes the frozen APIs + writes the `--lux-bend-*` wrapper |
| `cursorBend.css` | the compositor-only transform wrapper (consumes `--lux-*`, never `--lx-*`) |
| `*.test.ts` | budget bound · driver conformance · SSR composition + detached determinism |

## Status
**Commit 1 — harness built, technically verified. No tuning, no adoption.** Emotional review (Subconscious ·
Interaction Dominance · Decorative Necessity · Light Dominance) happens next, per
[CURSOR_BEND.md](../../../../../../docs/roadmaps/CURSOR_BEND.md).
