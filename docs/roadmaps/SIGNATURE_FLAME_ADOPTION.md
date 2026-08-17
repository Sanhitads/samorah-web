# Phase 2.1 — Signature Flame Adoption (Intro Retrofit)

The cinematic Match Strike Intro **adopts** the Luxury Flame Primitive as its flame's visual language, so
the primitive becomes the single canonical flame across Samorah. This is an *adoption*, not an
integration: the intro **composes** the primitive; it does not merge with it.

> **Status:** specification complete — implementation may begin (Commit 1). No pixel of the intro changes
> until the Emotional Regression Review passes.

---

## Governing principles (see FLAME_PRIMITIVE.md)
- **Presentation vs Experience** — Primitive = 100% presentation; Intro = 100% choreography.
- **Canonical Flame Contract** — the primitive is the single source of truth for the flame's visual identity.
- **Signature Components** — Flame · Match Strike · Wordmark Reveal require design review before changes.

## The separation (the spine)
| Layer | Owns | Never owns |
|---|---|---|
| **Flame Primitive** (Presentation) | visual flame: silhouette, palette, glow, ambient idle motion, size/variant/theme/motionProfile | ignition · fade · timeline · replay · storytelling — **it never knows it's inside an intro** |
| **Match Strike Intro** (Experience) | spark · ignition · glow · 2600 ms timeline · wordmark · fade · replay — **100% choreography** | drawing the flame's pixels, or touching the primitive's internals |

**Seam:** the intro renders `<Flame variant="match" … />` inside its **own** ignition wrapper; the intro's
CSS animates that wrapper (reveal → hold → fade) on the timeline. The primitive supplies pixels; the intro
supplies the story.

## API decision — `variant="match"` (not a public `showWick`)
Wick control is exposed as a **curated, named variant**, not a low-level boolean.

**Why (design-system governance wins over raw orthogonality):**
- A public `showWick` would let any developer toggle a low-level rendering flag *anywhere*, eroding the
  canonical identity. A named `variant="match"` is an **intentional, design-reviewed appearance** — exactly
  what the Canonical Flame Contract wants.
- Variants are a **curated set** (`classic` · `match` · future `ceramic`/`lantern`/…), each added by design
  review, so there is no open-ended "variant × wick" explosion — the set grows only when the brand needs it.
- `showWick` remains an **internal implementation detail** of `FlameSvg` (which is *not* exported). `<Flame>`
  maps `variant === "match"` → no wick internally. The public surface stays high-level and semantic.
- `match` = the `classic` silhouette **without the wick** (a struck match / relit flame), reusing the
  classic body + inner-core paths.

Backward-compatible: default `variant` stays `classic` (wick present) → every existing use is unchanged.

## Safest integration point
`IntroExperience.tsx` — the single `.lux-intro__flame` element becomes `<Flame variant="match"
motionProfile={…} />` inside an intro-owned ignition wrapper. `intro.css` repurposes `.lux-intro__flame`
from "draw a flame" to "ignite/fade the wrapped primitive." Spark · glow · scene · wordmark · veil ·
timeline · gate — **untouched**. Reduced-motion "hide the flame" is done by the intro hiding its **own**
wrapper, never by overriding primitive internals.

## File impact analysis
| File | Change | Nature | Risk |
|---|---|---|---|
| `flame/flame.config.ts` | add `"match"` to `FlameVariant` | additive type | Low |
| `flame/FlameSvg.tsx` | internal `showWick` prop → conditionally render `__wick` | additive, encapsulated | Low |
| `flame/Flame.tsx` | map `variant === "match"` → no wick | additive | Low |
| `flame/Flame.render.test.ts` | test `match` omits the wick; default keeps it | additive | none |
| `experiences/intro/IntroExperience.tsx` | swap `__flame` → `<Flame variant="match" …>` in ignition wrapper | Phase 1 | Med |
| `experiences/intro/intro.css` | drive the wrapper (ignition/fade); intro-owned reduced-motion hide | Phase 1 | **Med (crux)** |
| `LuxuryExperience.tsx` (gate/timers/replay) | **none** | — | none |

Primitive changes are additive/backward-compatible; default output is byte-identical.

## Regression analysis
- **Timeline/emotion:** intro keeps 100% of the timeline; only the flame's pixel source changes.
- **Replay:** untouched (gate/config/orchestration unchanged).
- **Performance:** CSS-only → CSS-only; no new JS; CLS 0; dismiss/failsafe timing unchanged.
- **Reduced-motion:** preserved via the intro's own wrapper hide.
- **Primitive back-compat:** default `classic` (wick) → all existing uses identical.

## Rollback strategy
Small reversible commits; during adoption **both flames coexist behind a flag** so the original is never
gone before emotional sign-off. Any step `git revert`s cleanly. The `match` variant is additive and stays
even if the adoption is reverted (harmless).

## Commit plan (small, reversible — verify + report before each next)
1. **`match` variant** (config + FlameSvg + Flame + tests) — additive; primitive frozen-by-default.
2. **A/B harness (toggle — never simultaneous)** — a flag switches the intro between **Mode A = original
   flame** and **Mode B = adopted `<Flame variant="match">`** in an intro ignition wrapper. The two intros
   are **never played at the same time** — you experience one, then the other — so the brain *experiences*
   rather than *diffs*. The original stays fully intact throughout.
3. **Tune to emotional parity** — ignition wrapper, `motionProfile`, reduced-motion hide.
4. **Adopt + remove original** — only after the Emotional Regression Review + Cross-Experience Consistency
   pass + browser QA. Freeze.

## Validation checklist — release gates
- [ ] **Emotional Regression Review (release gate):** watch old vs new **one at a time** (toggle Mode A /
      Mode B — **never two intros simultaneously**, so you *experience* rather than *diff*) — they **feel the
      same**; the match-strike still feels magical. **If even one reviewer says "it doesn't feel the same,"
      do not merge.**
- [ ] **Blind review:** a reviewer who does **not** know which version is which watches Intro A then Intro B
      and answers only **"which felt more magical?"** A preference for the original signals emotional regression.
- [ ] **Cross-Experience Consistency (release gate):** the Intro, the standalone Primitive preview, and any
      demo usage render the **identical canonical flame** — proving it truly became canonical.
- [ ] **Cross-variant regression:** `classic`, `match` (and future variants) do not accidentally change the
      default sizing, glow, motion profile, or alignment — only the intended difference (the wick) varies.
- [ ] Timeline boundaries unchanged (ignition ~30.8%, fade at 100%); pacing preserved.
- [ ] Reduced-motion matches the current intro (flame hidden, wordmark fade).
- [ ] Replay unchanged (first-visit plays · returning skips · version/30-day).
- [ ] `variant` defaults to `classic` → primitive's existing output unchanged; `match` omits the wick.
- [ ] No hydration warnings / console errors; 60fps; CLS 0; dismiss & failsafe timing unchanged.
- [ ] Browser QA before freeze.
