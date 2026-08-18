# Phase 3.2 — Signature Intro Ambient Illumination

> **The user's attention must remain on the flame, not on the light. The illumination exists only to
> reinforce the flame's emotional presence.** The flame is the actor; the light is its consequence —
> exactly how real candlelight works.

An **experience composition phase, not a lighting phase.** The goal is not to add a visible light — it is to
make the existing Match Strike Intro feel *warmer*, as an ambient consequence of the flame that never
competes with it. It composes the proven `FlameLightSource` (Phase 3.1) into the intro, touching **no
frozen engine**.

> **Status:** ✅ **ADOPTED & FROZEN** — the Match Strike Intro renders the ambient illumination (premium
> profile) behind the flame **by default**; the A/B harness has been removed. Human verdict: **Adopt** (all
> five gates pass — see `docs/reviews/phase-3.2/VERDICT.md`).

## Decisions (locked)
1. **Coexist with `.lux-intro__glow`.** `AmbientLight` is an **independent atmospheric layer**; it **never
   replaces or reconciles** the scripted glow. The `__glow` burst remains part of the Match Strike
   choreography. **`AmbientLight` is additive only — it never replaces existing emotional effects.** ✅
2. **Phase 3.2 is the governed re-opening of the frozen intro** under the **Canonical Experience Rule**
   (explicit design review + emotional-parity discipline + a new freeze). ✅ No frozen *engine* changes.

## Light Lifecycle Rule
> **The Ambient Lighting Engine is never animated directly.** The chain is **Experience → Source →
> Renderer**, never Experience → Renderer:
>
> `Intro timeline → flame availability → LightSource availability → AmbientLight`
>
> The **Experience controls the light through the `LightSource`** (its availability and state) — it changes
> *whether the source exists*, not the renderer. The renderer (`AmbientLight`) stays presentation-only and
> simply renders **whenever the source exists**. Animating the renderer (a second animation owner) is
> prohibited — the source is the single control point.

## Composition
```
Flame (in the intro) → FlameLightSource(at the flame's position) → resolveAmbientLight(subtle profile) → <AmbientLight>
```
The intro composes an `<AmbientLight>` **behind** the flame, from a `FlameLightSource` at the flame's
position, with a **subtle** profile. Its presence is a consequence of the flame — the experience owns when
it exists and any fade; the renderer stays static.

## Ownership — no overlapping responsibility

**Technical**
| Concern | Owner |
|---|---|
| light preset (radius/intensity/falloff/blend) | `LightingPreset` (subtle profile) |
| capability tier | Capability Manager (governor) |
| light visibility | `LightSource.isAvailable()` |
| light rendering | `AmbientLight` (presentation only) |

**Emotional**
| Concern | Owner |
|---|---|
| Emotion | Match Strike Intro |
| Flame pixels | Flame Primitive |
| Light pixels | Ambient Lighting Engine (`AmbientLight`) |
| Composition | `FlameLightSource` (composition layer) |
| Timing | Experience Engine (the intro's timeline/orchestration) |

**Spatial** — *the engine never decides where the light belongs.*
| Concern | Owner |
|---|---|
| Position | Intro Experience |
| Offset | Intro Experience |
| Layering | Intro Experience |
| Radius (value) | `LightingPreset` (the *profile* is selected by the Intro Experience) |
| Rendering | `AmbientLight` |

### Layer order (explicit — asserted, not implicit)
Front → back: **Spark · Flame · AmbientLight · Background.** Phase 3.2's invariant, asserted in
`experiences/intro/ambientLayerOrder.test.ts`: **`AmbientLight` is behind both the Flame and the Spark, and
in front of the Background** — it is the backmost overlay (`ambient < flame`, `ambient < spark`). The
Spark/Flame relative stacking is inherited from the frozen Phase 2.1 intro and is not altered here.

## Files
- **Change (additive, the intro *experience*):** `IntroExperience.tsx` (compose `<AmbientLight>` behind the
  flame **and control the `LightSource` lifecycle**), `intro.css` (position + layer the light behind the
  flame — **static; no light animation**, per the Light Lifecycle Rule).
- **Must NEVER change (frozen engines/primitives):** all Flame Primitive files · all Ambient Lighting
  Engine files (`AmbientLight.tsx`, `lighting.css`, config, sources, `experience.ts`, `index.ts`) ·
  `composition/FlameLightSource.ts` (reused as-is) · `LuxuryExperience.tsx` (gate/timers/replay).

## Validation — release gates
- [ ] **Emotional Parity** — the intro still feels like the Match Strike; the flame remains the focus
      (A/B, one at a time; blind "which felt more magical?"). If it feels different → reject.
- [ ] **Light Dominance Review** *(release gate)* — reviewers answer only: **"Did you notice the light
      before you noticed the flame?"** If **yes → reject immediately** (Lighting Design Contract violated).
- [ ] **Layer Dominance Review** *(browser QA)* — confirm: the **spark remains the brightest event**; the
      **flame remains the primary focal point**; the **`AmbientLight` is noticed only by its absence**; the
      **`__glow` and `AmbientLight` never visually merge** into one indistinct effect.
- [ ] **Edge Visibility Review** *(browser QA)* — watch the intro on a **dim laptop**, a **bright desktop**,
      and a **high-brightness mobile**; confirm the light **disappears naturally rather than ending
      abruptly** (ambient light can look perfect on one display yet "pop" off on another).
- [ ] **Decorative Necessity Review** *(release gate)* — **"If this decorative layer disappeared, would
      users immediately notice?"** Desired answer: **No.** If reviewers immediately notice its removal, the
      layer has become too important and violates the Lighting Design Contract — the strongest confirmation
      of *absence before presence*. (A **permanent platform-wide gate** — see LUXURY_PLATFORM.md.)
- [ ] **Visual regression artifacts** — the 8-shot Mode A / Mode B × desktop/mobile × dark/light matrix is
      captured into `docs/reviews/phase-3.2/` (baseline for future comparison).
- [ ] **Timeline Lock** — 2600 ms + spark/ignition/wordmark/fade timings unchanged.
- [ ] **No frozen-engine diff** — `git diff` of Flame + Lighting engines = 0.
- [ ] No replay / hydration / performance / accessibility regression.

## Rollback
Plain **`git revert`** — the intro changes are additive (`<AmbientLight>` + its CSS); reverting restores the
frozen intro exactly.

## Implementation sequence (disciplined — never combined)
1. **Commit 1 — A/B harness only** (default = original intro; nothing adopted or removed).
2. **Visual review** — Emotional Parity + Light Dominance + Layer Dominance + Edge Visibility.
3. **Tune** — presentation only, and only in response to a specific reviewer-identified difference.
4. **Commit 2 — Adopt** (after unanimous approval).
5. **Commit 3 — Remove the prototype harness.**
6. **Commit 4 — Freeze** documentation + rollback verification.

## 🔒 Platform Contract Verification
| Governance | Preserved? |
|---|---|
| Platform Stability Rule (frozen *engines*) | ✅ no engine modified — composed via public APIs |
| Platform Extension Rule | ✅ no new public API |
| Composition Layer Contract | ✅ `FlameLightSource` reused, unchanged |
| Canonical Experience Rule | ⚠️ intro touched — **Phase 3.2 IS the required design review** (governed, not violated); re-frozen at the end |
| Lighting Design Contract (never focal point · absence before presence · Light Dominance Review) | ✅ the illumination reinforces, never competes |
| Renderer Purity · Source Ownership · Experience Ownership · Light Lifecycle Rule | ✅ renderer static; experience owns lifecycle/timing |
| ADR-0007 / 0008 · Freeze Notes | ✅ (intro freeze re-opened under governance, re-frozen) |

**No engine contract changes.** The review closes cleanly — no platform evolution required.

## 🔒 Freeze Note (Phase 3.2 — binding)
This experience composes **Ambient Lighting Engine v1.1 exactly as frozen**. It is now a **closed, frozen
experience.**

> **Any future change to the intro's lighting behavior — position, radius, intensity, colour, blend, bend,
> breathe, timing, or the addition of any driver — must begin with a NEW architecture review and its own
> re-freeze. It must NOT be implemented by editing this frozen experience in place.**

**Why this is stated explicitly:** Phase 3.3 (Cursor Bend) is next, and the natural temptation while working
nearby will be *"I'll just tweak the intro light while I'm here."* That is precisely the platform erosion the
Stability Rule exists to prevent. This Freeze Note forbids it. The intro's ambient illumination changes
**only** through the governed cycle — new review · ADR (if a contract is touched) · regression verification ·
new freeze — never as a side effect of an adjacent phase.

**Concretely, Phase 3.3 must NOT touch:** `IntroExperience.tsx`, `intro.css`, `LuxuryExperience.tsx`, or any
Ambient Lighting Engine file. Cursor Bend is a **separate composition** proven in isolation; it does not
re-open this experience. See [CURSOR_BEND.md](CURSOR_BEND.md).
