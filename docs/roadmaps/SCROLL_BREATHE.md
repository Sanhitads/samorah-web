# Phase 3.4 — Scroll Breathe Validation · Architecture Review (NO CODE)

> **Scrolling must never produce a visible pulse. The light exists in a room the user moves through; as they
> move, it breathes — a sub-perceptual swell and ebb of warmth that makes the space feel physically
> inhabited, never a light that "reacts to the scrollbar."** If a reviewer can say *"the light pulses when I
> scroll,"* the phase has failed. The success criterion is a feeling (*the room is alive*), never a behaviour
> (*the light responds to scrolling*).

> **Status:** 🧭 **Architecture review only — awaiting approval. No implementation exists or is authorised by
> this document.** Scroll is a *high-frequency* input (it fires constantly and the user is looking at content
> the whole time), which makes an intensity effect even easier to notice than cursor position. This review's
> job is to make a visible pulse structurally impossible before any code is written.

> **Naming (mirrors "3.1 Composition Proven" / "3.3 Cursor Bend Validation").** This is **Scroll Breathe
> *Validation*** — it *proves the concept in isolation*; it does **not** adopt the interaction. Adoption onto
> a live persistent light is a separate, later, reviewed sub-phase.

---

## 0. Scope — what Phase 3.4 is, and is not
Phase 3.4 builds and **proves in isolation** one reusable capability: a **Scroll Breathe driver** — a bounded
**intensity** modulator for an existing ambient light. It is the intensity-channel sibling of Cursor Bend
(3.3, position channel) and **begins from the frozen Cursor Bend Validation harness as its reference**
(copy/compose its shape — frozen-`LightDriver` impl + a bounded budget + an experience-owned `--lux-*`
wrapper — **do not extend or modify** `cursorBend/`; see CURSOR_BEND.md §13).

- **In scope:** the Scroll Breathe **driver** + a **Composition Validation harness** proving it breathes a
  persistent probe light through the frozen public APIs, in isolation, with no live placement. Plus one
  **cross-driver composition** check (Cursor Bend position + Scroll Breathe intensity on the same wrapper) to
  prove the two compose without conflict, both bounded.
- **Explicitly OUT of scope:** any live adoption; the **frozen intro** is not re-opened; no persistent-light
  placement ships.

---

## 1. Platform Composition Checklist (answered before any code)
| Question | Answer |
|---|---|
| Does this phase **modify any frozen engine**? | **No.** Every Ambient Lighting Engine file stays byte-identical; the frozen `LightDriver` interface is *consumed*, not changed. |
| Can this be achieved with **public APIs only**? | **Yes** — `LightDriver`, `LightModulation`, `LightSource`, `resolveAmbientLight`, `AmbientLight`, `resolveLightingTier` (barrel exports) + an experience-owned opacity wrapper. |
| Is a **new engine public API** required? | **No.** The concrete driver lives in the validation layer, implementing the already-frozen `LightDriver` type. No new engine export. |
| Does this introduce a **reusable** capability (not single-use)? | **Yes** — a bounded intensity modulator reusable by any persistent light. |
| Can rollback remain a **simple `git revert`**? | **Yes** — all new files additive under `experiences/_validation/scrollBreathe/`. |
| Does this preserve **all ADRs and platform contracts**? | **Yes** (full verification in §9). |

**Checklist verdict:** every box is compositional. Phase 3.4 is **experience composition, not engine
evolution** — confirmed again in §10.

---

## 2. Goal
### What "Scroll Breathe" means emotionally
As the user scrolls through the experience, the ambient light **breathes** — a slow, tiny swell/ebb in
luminance, loosely coupled to scroll motion (and damped heavily so it lags and softens). Like a candle
responding to the air displaced as someone walks past it: you never watch the flame flicker on cue, but the
room feels *occupied*.

### Why it exists
Cursor Bend gives the light presence in response to the *pointer*; Scroll Breathe gives it presence in
response to *movement through the content*. Scrolling is the primary way a user travels through a page; tying
a sub-perceptual warmth to that travel makes the whole experience feel physically lit and continuous rather
than a flat document. It reinforces the flame's emotional presence across the entire scroll, not just the
intro moment.

### Why users must not consciously notice it
The Lighting Design Contract's core rule — *notice its absence before its presence*. A luminance change tied
to scroll is the **most dangerous** decorative effect yet: scroll is frequent and the eye is on the content
while it happens, so any visible pulse instantly becomes "the subject." It must be **sub-perceptual** (a tiny
opacity delta, slow, damped) or it violates the Focal Point Rule and reads as a gimmick.

---

## 3. Ownership — no overlapping responsibility
| Concern | Owner | Note |
|---|---|---|
| **Breathing source** (does light exist at all) | **`LightSource`** (the flame / persistent source) | The breath is a *modulation of* an existing light, never a light of its own. No source → no light → nothing to breathe (Light Source Ownership Contract). |
| **Breathing signal** (the scroll input) | **Scroll Breathe driver** | Owns a single **passive**, rAF-coalesced `scroll` listener; attached only when permitted; removed on unmount. No listener in the renderer. |
| **Timing** | **The Experience** (attach/detach) + the driver's **damping** | No keyframe timeline. "Timing" = the driver's slow low-pass smoothing + one compositor write per frame; the CSS transition eases the bounded delta. The renderer owns nothing temporal. |
| **Intensity modulation** | **Scroll Breathe driver** (`channels: ["intensity"]`, `modulate() → { dIntensity }`) | A **bounded delta**, mapped by the experience to a bounded wrapper **opacity** (the zero-engine seam — §4). |
| **Visibility** | **`LightSource.isAvailable()`** | Sole authority; the renderer disappears with the source regardless of the driver. |
| **Capability gating** | **Capability Manager** (`resolveLightingTier`/`detectMotionTier`) | `on` → breathe; `dim`/`reduced` → static, no listener; `off` → no light. **Final governor — never out-voted.** |
| **Rendering** | **`AmbientLight`** (frozen renderer) | Unchanged. Draws the same deterministic field; knows nothing about scroll. |
| **Experience composition** | **The Experience** | Only an Experience composes `<AmbientLight>`, attaches the driver, and owns the wrapper (Experience Ownership Contract). |

---

## 4. Driver model — how Scroll Breathe composes
### The one honest constraint (same seam logic as 3.3)
The frozen surface is narrow: `resolveAmbientLight(config, source)` takes **no driver**, and `AmbientLight`
renders a **static** field whose intensity comes from the preset. So a driver's `dIntensity` cannot reach the
frozen renderer without editing a frozen file. The **only** zero-engine seam is the experience:

- ✅ **Chosen (pure composition):** the driver's bounded `dIntensity` → an experience-owned **opacity** on a
  wrapper around `<AmbientLight>` (`--lux-breathe`), eased by a CSS transition. **Opacity is compositor-safe**
  (no gradient repaint) — unlike `filter: brightness()`, which repaints and is off the table. Renderer and
  resolver untouched.
- ⛔ **Rejected (engine evolution — out of scope):** teaching `resolveAmbientLight`/`AmbientLight` to consume
  drivers or a breathe variable. That is **Ambient Lighting Engine v1.2** — its own review + ADR + re-freeze.

### Composition with each frozen piece
- **Existing `LightSource`** — read-only base authority; Scroll Breathe reads nothing from it and never
  changes its intensity value. The source still decides existence.
- **`AmbientLight`** — renders unchanged; the breath is a wrapper opacity *around* it (Renderer Purity intact).
- **Cursor Bend** — **orthogonal channel.** Cursor Bend modulates **position** (wrapper `transform`); Scroll
  Breathe modulates **intensity** (wrapper `opacity`). They apply to different CSS properties on the same
  experience wrapper and never contend. A cross-driver validation proves both bounded simultaneously.
- **Movement Budget** — Scroll Breathe carries its **own instance of the permanent Movement Budget rule**
  applied to the intensity channel (call it the **Breath Budget**): a small, fixed cap on the opacity delta
  (target ≈ **≤ 0.06 opacity**, tuned down until imperceptible), limiting the **maximum** effect, not the
  average.

### Scroll Breathe never replaces another driver
Per the Driver Resolution Contract, drivers **modulate**, never replace. Scroll Breathe contributes a bounded
`dIntensity` only; it creates no light, mounts nothing, reads no source, and leaves position/colour/profile
untouched. Remove it and the light is exactly Source × Preset (+ any Cursor position delta).

---

## 5. Driver Resolution — order, conflict, bounds
Per the frozen **Driver Resolution Contract** composition order (low → high):

```
Source (base) → Profile/CMS preset → Scroll (intensity) → Cursor (position) → [global clamp] → ⛔ Accessibility / Capability Override (final)
```
- **Priorities:** Scroll Breathe **priority 10** (resolves before Cursor Bend's **20**), matching the
  contract's ordering. Lower priority resolves earlier.
- **Conflict resolution:** Scroll (intensity) and Cursor (position) touch **different channels** → no direct
  conflict. If a *future* driver also modulated intensity, deltas **sum then clamp** (bounded), priority
  orders application, and the global clamp caps the composite.
- **All modulation bounded:** each driver's delta is capped by its own budget (Movement Budget / Breath
  Budget); the composite is capped by a global clamp; **accessibility overrides everything** and can force
  static/none. With no drivers, the light is fully static (the 3.1 baseline) — determinism preserved.

---

## 6. Files

### Change (all NEW · additive · isolation only)
- `experiences/_validation/scrollBreathe/breathBudget.ts` — the Breath Budget (an instance of the permanent
  Movement Budget rule on the intensity channel) + `clampToBreath`.
- `experiences/_validation/scrollBreathe/scrollBreatheDriver.ts` — the concrete driver: implements the
  **frozen** `LightDriver` (`channels: ["intensity"]`, `priority: 10`, `modulate() → { dIntensity }`); pure
  `computeBreath` + a bounded, passive, rAF-coalesced `scroll` signal; SSR-safe.
- `experiences/_validation/scrollBreathe/ScrollBreatheProbe.tsx` — the isolated harness: composes the frozen
  APIs and writes the experience-owned `--lux-breathe` opacity wrapper.
- `experiences/_validation/scrollBreathe/scrollBreathe.css` — the compositor-only opacity wrapper (consumes
  `--lux-*`, never `--lx-*`).
- tests — Breath Budget bound · driver conformance · SSR composition + detached determinism · scroll-flood
  resilience · **cross-driver composition** (Cursor position + Scroll intensity, both bounded).
- `docs/roadmaps/SCROLL_BREATHE.md` — this review; roadmap "done" edits deferred to the freeze commit.

### Must NEVER change (frozen)
- **Every Ambient Lighting Engine file:** `AmbientLight.tsx`, `lighting.css`, `lighting.tokens.css`,
  `lighting.config.ts`, `experience.ts`, `capability.ts`, `sources/*`, `drivers/driver.ts`, `index.ts`.
- **`composition/FlameLightSource.ts`** — reused unchanged.
- **The Cursor Bend Validation harness** (`experiences/_validation/cursorBend/`) — frozen reference; **compose
  from / copy the shape, never extend or edit** it (CURSOR_BEND.md §13).
- **The frozen intro:** `IntroExperience.tsx`, `intro.css`, `LuxuryExperience.tsx`.

---

## 7. Validation

### 7.1 Technical
- [ ] Implements the frozen `LightDriver` unchanged; `channels === ["intensity"]` only.
- [ ] `modulate()`/`computeBreath` output is **hard-clamped** to the Breath Budget (property test: `|dIntensity|`
      and the mapped opacity delta ≤ cap, for any scroll input / viewport).
- [ ] Budget is a **fixed logical amount** — independent of devicePixelRatio, zoom, scroll length, or document
      height.
- [ ] **Zero frozen-file diff** across engine, `FlameLightSource`, `cursorBend/`, and the intro.
- [ ] **Detached determinism** — SSR output byte-identical to the static baseline (Renderer Purity).
- [ ] **Scroll-flood resilience** — hundreds of `scroll` events keep at most **one** rAF in flight → exactly
      one opacity update on flush.
- [ ] Passive listener, coalesced to ≤ one write per frame, **removed on unmount** (no leak); pointer/scroll
      handlers perform **no layout read** (measure only inside the flush).
- [ ] **Cross-driver composition** — with Cursor Bend attached too, both stay bounded and orthogonal
      (transform vs opacity); neither replaces the other.
- [ ] **Capability gate** — `dim`/`reduced` → driver never attaches; `off` → no light.
- [ ] Uses the **`--lux-*`** experience namespace; declares **no `--lx-*`** token. SSR-safe (no `window` at import).

### 7.2 Browser
- [ ] Dim laptop · bright desktop · high-brightness mobile — the breath is imperceptible-but-warm, never a pulse.
- [ ] `prefers-reduced-motion: reduce` — no listener; light fully static.
- [ ] **Performance** — one compositor **opacity** write per frame, **no repaint, no layout, CLS 0**, no jank
      during fast scroll; the light never visibly "pumps."

### 7.3 Emotional (human review — separate from technical)
- [ ] **Subconscious test** — *"Does the light pulse / breathe visibly when you scroll?"* If **yes → reject.**
- [ ] **Interaction Dominance Review** — *"Did you scroll just to watch the light?"* Must be **No.**
- [ ] **Decorative Necessity** — *"If the breath vanished, would you immediately notice?"* Must be **No.**
- [ ] **Light Dominance** — *"Did you notice the light before the content while scrolling?"* Must be **No.**

---

## 8. Rollback
Plain **`git revert`** — all new files are additive under `experiences/_validation/scrollBreathe/`. Delete the
folder / revert the commits; zero engine, intro, and Cursor-Bend impact (none are touched).

---

## 9. 🔒 Platform Contract Verification
| Governance | Preserved? | How |
|---|---|---|
| **Platform Stability Rule** | ✅ | No frozen engine modified; composed via public APIs only. |
| **Platform Extension Rule** | ✅ | No new engine public API; the driver consumes the frozen `LightDriver` type from the validation layer. |
| **Composition Layer Contract** | ✅ | New driver composes frozen engines via public APIs, exposes no new API, deletable without changing engine behaviour. |
| **Driver Resolution Contract** | ✅ | `intensity` channel only · priority 10 (before Cursor 20) · bounded delta · sum-then-clamp · accessibility final. |
| **Lighting Design Contract** (Focal Point · Light Dominance · absence before presence) | ✅ | Sub-perceptual, Breath-Budget-capped, capability-gated; Interaction Dominance a hard reject gate. |
| **Renderer Purity Contract** | ✅ | Renderer untouched and deterministic; dynamism lives entirely in the driver + experience wrapper. |
| **Public API Stability Contract** | ✅ | `lighting/index.ts` unchanged; experiences still import only from the barrel. |
| **Movement Budget (permanent rule)** | ✅ | Breath Budget is an instance of it on the intensity channel — caps the maximum, not the average. |
| **Lighting Token Ownership / Experience Ownership** | ✅ | Breath var is experience-owned `--lux-*`; only an Experience composes the light. |
| **ADR-0007 / 0008 / 0009 · Freeze Notes** | ✅ | No contract changed; intro + Cursor-Bend freezes honoured. |

**No engine contract changes. The review closes cleanly — no platform evolution required for Phase 3.4.**

---

## 10. Assessment
Phase 3.4 requires **only experience composition.**
- **Engine evolution:** ❌ none — every frozen engine file stays byte-identical.
- **Public API additions:** ❌ none — the driver consumes the already-frozen `LightDriver` type; `index.ts`
  is untouched.
- **Experience composition:** ✅ the whole phase — a bounded intensity driver + an experience-owned `--lux-*`
  opacity wrapper, composed through frozen public APIs and proven in isolation, exactly mirroring the Cursor
  Bend Validation pattern.

The dominant risk — a visible scroll-driven pulse — is designed out structurally (breathe-not-pulse · Breath
Budget · compositor opacity only · heavy damping · capability-gated · Subconscious + Interaction Dominance as
hard reject gates), not left to tuning.

**Stop. No implementation.** Awaiting explicit approval to begin the build sequence (Commit 1 = driver +
harness; then emotional review; then freeze) — the same disciplined sequence proven in 3.1 → 3.3.
