# Scroll Breathe Validation — isolation harness (Phase 3.4)

**Prove-in-isolation only. Not routed. Not imported by any production experience.** Delete the folder to
remove it (`git revert`); nothing else changes. Built from the frozen Cursor Bend Validation harness as its
reference (copied the shape; did **not** modify `cursorBend/`).

## What this proves
The approved chain, using **only frozen public APIs**:

```
createFlameLightSource → resolveAmbientLight() → <AmbientLight>     (all untouched)
        + Scroll Breathe driver → experience-owned --lux-breathe OPACITY wrapper
```

The scroll breath lives **entirely in this validation layer**. No Ambient Lighting Engine, Flame Primitive,
Composition Layer, Experience Engine, or Cursor Bend harness is modified. No new public API is added.

## Breath Budget + Scroll Idle Rule
- **Breath Budget** (`breathBudget.ts`) — an instance of the permanent Movement Budget rule on the intensity
  channel; cap **0.06 opacity**, one-directional, non-negative; enforced by `clampToBreath`. Neutral is full
  opacity, so a detached light is byte-identical to the static baseline.
- **Scroll Idle Rule** — when scrolling stops, the breath returns **smoothly to neutral, exactly once, with
  no overshoot or oscillation** (CSS transition eases; there is no spring). Enforced by the driver's idle
  timer + tested in `scrollBreatheLifecycle.test.ts`.

## Files
| File | Role |
|---|---|
| `breathBudget.ts` | the permanent bound + `clampToBreath` |
| `scrollBreatheDriver.ts` | frozen `LightDriver` impl (`intensity` channel only, priority 10); `computeBreath` (pure) + passive, rAF-coalesced scroll signal + idle-reset |
| `ScrollBreatheProbe.tsx` | the isolated harness: composes the frozen APIs + writes the `--lux-breathe` opacity wrapper |
| `scrollBreathe.css` | the compositor-only opacity wrapper (consumes `--lux-*`, never `--lx-*`) |
| `*.test.ts` | budget · driver conformance · SSR composition + determinism · scroll lifecycle/idle/flood · cross-driver coexistence |

## Status
**Commit 1 — harness built, technically verified. No tuning, no browser review, no adoption.** Emotional
review (Subconscious · Interaction Dominance · Decorative Necessity · Light Dominance) happens next, per
[SCROLL_BREATHE.md](../../../../../../docs/roadmaps/SCROLL_BREATHE.md).
