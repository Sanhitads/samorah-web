# Phase 3.3 — Cursor Bend Validation · Architecture Review (NO CODE)

> **Naming (mirrors "3.1 Composition Proven").** This phase is **Cursor Bend *Validation*** — it *proves the
> concept in isolation*; it does **not** permanently adopt the interaction. The name is deliberately honest
> about scope: a validated capability, not a shipped feature.

> **Cursor movement must never become a visible animation. It exists only to create a subconscious
> impression that the light is naturally responding to presence.** The cursor is not tracked, not followed,
> and never drawn. If a reviewer can point at the screen and say *"the light is reacting to my mouse,"* the
> phase has failed — no matter how subtle the tuning. The desired perception is not "it moves"; it is
> *"the room feels alive"* — and the viewer can never say why.

> **Status:** 🧭 **Architecture review only — awaiting approval. No implementation exists or is authorised by
> this document.** Cursor interaction is materially more dangerous than static lighting: static light can
> only be too bright; cursor light can become a *gimmick.* This review's job is to make a gimmick
> structurally impossible before a single line is written.

---

## 0. Scope — what Phase 3.3 is, and is not

Phase 3.3 builds and **proves in isolation** a single reusable capability: a **Cursor Bend driver** — a
bounded position *modulator* for an existing ambient light. It follows the same rhythm the platform already
practised (**3.1 prove-in-isolation → 3.2 adopt**):

- **In scope:** the Cursor Bend **driver** (composition-layer), and a **Composition Validation harness** that
  proves it bends a persistent light through the frozen public APIs, in isolation, with no live placement.
- **Explicitly OUT of scope:** any live adoption; **the frozen intro** (`IntroExperience`) is *not* re-opened
  (it is transient — 2.6 s — and captures pointer events; bending it would be pointless and would violate its
  Freeze Note). Live adoption onto a **persistent** ambient light is a **later, separately-reviewed**
  sub-phase with its own emotional review — never bundled here.

This keeps 3.3 a pure **composition** phase. It proves the capability; it does not ship an interaction to
users.

---

## 1. Platform Composition Checklist (answered before any code)
| Question | Answer |
|---|---|
| Does this phase modify any **frozen engine**? | **No.** Every Ambient Lighting Engine file stays byte-identical; the frozen `LightDriver` **interface** is *consumed*, not changed. |
| Can this be achieved using **public APIs only**? | **Yes** — `LightDriver`, `LightModulation`, `LightSource`, `resolveAmbientLight`, `AmbientLight`, `resolveLightingTier` (all barrel exports) + an **experience-owned** transform wrapper. |
| Is a **new platform (engine) capability** actually required? | **No new engine public API in 3.3.** The concrete driver lives in the **composition layer**, implementing the already-frozen `LightDriver` type. (Promotion into the engine's public surface, if ever, is a *separate* governed engine evolution — see §11.) |
| Does this introduce a **reusable** capability (not single-use)? | **Yes** — a bounded position modulator reusable by *any* persistent light (hero, product, campaign). Not intro-specific. |
| Can rollback remain a **simple `git revert`**? | **Yes** — all new files are additive; delete the composition files + one export/registration line. |
| Does this preserve **all existing ADRs and platform contracts**? | **Yes** (full verification in §10). |

**Checklist verdict:** every box is compositional. Phase 3.3 is a **composition phase, not an engine
evolution.**

---

## 2. Proof: composition, not engine evolution

### 2.1 The required chain
```
Cursor Driver  (bounded position modulator — composition layer)
      ↓  contributes a clamped {dx,dy} ONLY
FlameLightSource  (frozen — still owns base position/intensity/colour)
      ↓  unchanged
resolveAmbientLight()  (frozen — still returns { preset, source })
      ↓  unchanged
AmbientLight  (frozen renderer — still draws a static, deterministic field)
```
The cursor sits **upstream as a modulator** and downstream as a **bounded transform on the experience's own
wrapper.** It never enters the renderer and never replaces the source.

### 2.2 The one honest constraint (why the seam is where it is)
The frozen v1.1 surface is deliberately narrow:
- `resolveAmbientLight(config, source)` accepts **no driver**; `AmbientLightPlacement` is **`{ preset, source }`**.
- `AmbientLight` renders a **static** field and consumes **no bend variable**.

Therefore there is **exactly one** way to make a driver's `{dx,dy}` bend the light **without editing a frozen
file**: the **experience applies the bounded delta as a compositor transform on a wrapper element it owns**
around `<AmbientLight>`. The renderer and resolver are untouched; only the experience's own wrapper moves.

- ✅ **Chosen (pure composition):** driver → bounded CSS custom property on an **experience-owned** wrapper →
  `transform: translate3d(...)` on that wrapper. Zero frozen-file diff.
- ⛔ **Rejected (engine evolution — out of scope):** teaching `resolveAmbientLight` to accept drivers, or
  teaching `AmbientLight` to read a bend variable. Either would modify a frozen engine file → that is
  **Ambient Lighting Engine v1.2**, requiring its own review + ADR + re-freeze. **Not Phase 3.3.**

### 2.3 Token-namespace guard
The bend variable is **experience-owned** and lives in the **`--lux-*`** namespace (e.g. `--lux-bend-x` /
`--lux-bend-y`). It is **not** an `--lx-*` lighting token — the **Lighting Token Ownership Contract** reserves
`--lx-*` for `lighting.tokens.css` alone. The driver writes an *experience* transform var; it never declares
or mutates an engine lighting token.

---

## 3. Ownership — no overlapping responsibility
| Concern | Owner | Note |
|---|---|---|
| **Cursor input** | **Cursor Bend driver** (composition layer) | Owns a single **passive**, frame-coalesced `pointermove` listener; attached only when permitted; removed on unmount. No listener lives in the renderer. |
| **Bend calculation** | **Cursor Bend driver** (`modulate()`) | Maps cursor offset-from-centre → a **heavily damped, hard-clamped** `{dx,dy}`. Bounded delta only — never an absolute position. |
| **Light rendering** | **`AmbientLight`** (frozen renderer) | Unchanged. Draws the same deterministic field; knows nothing about the cursor. |
| **Capability gating** | **Capability Manager** (`resolveLightingTier`/`detectMotionTier`) | `on` → driver may attach; `dim`/`reduced` → static, no driver; `off` → no light. **Final governor — can never be out-voted.** |
| **Timing** | **The Experience** (attach/detach) + the driver's **smoothing** | There is **no keyframe timeline.** "Timing" = the driver's slow low-pass damping + one compositor write per frame; the experience decides *when* the driver is attached (bound to source availability). The renderer owns nothing temporal. |
| **Position (base)** | **`FlameLightSource`** | Cursor only nudges around it; base position is the source's. |
| **Intensity / colour / profile / radius / blend** | **`LightingPreset`** | The cursor may **never** touch these (see §4). |

---

## 4. Driver Resolution — cursor is a bounded modulator, never the source
Per the frozen **Driver Resolution Contract** and `LightDriver` interface (`channels`, `priority`,
`modulate(): LightModulation`):

- **Position channel only.** The Cursor Bend driver declares `channels: ["position"]`. It contributes
  `{ dx, dy }` and **nothing else**.
- **Never replaces the LightSource.** It reads no source, mounts nothing, and creates no light. If the source
  is unavailable, `resolveAmbientLight` returns `null`, no wrapper exists, and the driver has nothing to move
  (**Light Source Ownership Contract**).
- **Intensity, colour, profile, radius, blend remain owned by the preset.** The driver has no channel to them
  and no API to reach them.
- **Bounded delta (hard cap).** `{dx,dy}` are clamped to a small pixel budget (target ≈ **±4–6 px**, tuned
  down until imperceptible) with heavy damping, so the light *leans*, never *travels*. "Bend, not follow."
- **Accessibility is the final vote.** `reduced-motion`/off-tier force static/none and override the driver
  unconditionally — it is a governor, not a driver.
- **Determinism preserved.** With the driver detached, the light == Source × Preset — byte-identical to the
  3.1/3.2 static baseline (asserted in validation).

---

## 5. Emotional Design — how Cursor Bend stays subconscious
It must satisfy every permanent lighting gate:

- **Decorative Necessity** — *"If the bend disappeared, would users immediately notice?"* Desired: **No.** The
  bend is a whisper on top of an already-complete static light; removing it must feel like nothing changed.
- **Interaction Dominance** *(new — the interaction equivalent of Decorative Necessity)* — *"Did moving the
  cursor become something users wanted to play with?"* Desired: **No.** If users intentionally wave the
  cursor to watch the light, the interaction has **become the feature** — visually dominant, and a violation
  of the Lighting Design Contract. The cursor response must stay **subconscious**, reinforcing presence, not
  **entertaining.** (Recorded permanently in `LUXURY_PLATFORM.md` alongside Decorative Necessity.)
- **Light Dominance** — *"Did you notice the light (or your cursor) before the content?"* If **yes → reject.**
  The content stays dominant; the light stays a consequence.
- **Never the focal point** — the light is never the subject; the cursor is **never drawn, never tracked,
  never chased.** No spotlight, no follow, no trail (the engine's *Never build* list stands).
- **Absence before presence** — the effect is designed to be noticed only by its *absence*, and only barely.

**Why it stays subconscious (by construction, not by luck):**
1. **Bend, not follow** — the light leans a few pixels toward presence and springs back; it never arrives at
   the cursor, so the eye is given nothing to lock onto.
2. **Hard clamp + heavy damping** — the motion budget is smaller than a person consciously registers, and the
   low-pass smoothing means there is no crisp 1:1 correspondence to betray the mechanism.
3. **No timeline, compositor-only** — no easing curve to "read," no repaint; the change is a sub-perceptual
   transform.
4. **Capability-gated off** — the moment a viewer signals reduced motion, the bend simply isn't there.

The success criterion is a **feeling** (*the room feels alive*), never a **behaviour** (*the light follows
me*). The tuning target is the largest bend that **cannot be consciously attributed to the cursor.**

---

## 6. Files

### Change (all NEW · additive · isolation only)
- `lighting/composition/cursorBendDriver.ts` — the concrete driver: implements the **frozen** `LightDriver`
  interface (`channels: ["position"]`, `priority`, `modulate()`); owns a bounded, passive, frame-coalesced
  pointer signal + damping; returns a **hard-clamped** `{dx,dy}`. SSR-safe (no `window` at module load).
- A **Composition Validation harness** (isolation, not routed / not shipped) proving the chain bends a
  *persistent* test light and is byte-identical when detached — e.g.
  `lighting/tests/CursorBendComposition.test.tsx` (+ an optional dormant probe placement under an
  `experiences/_validation/` folder that is never linked into any route).
- `docs/roadmaps/CURSOR_BEND.md` — this review; roadmap "done" edits are deferred to the freeze commit.

### Must NEVER change (frozen)
- **Every Ambient Lighting Engine file:** `AmbientLight.tsx`, `lighting.css`, `lighting.tokens.css`,
  `lighting.config.ts`, `experience.ts`, `capability.ts`, `sources/*`, **`drivers/driver.ts`** (interface
  consumed as-is), `index.ts`.
- **`composition/FlameLightSource.ts`** — reused unchanged.
- **The frozen intro:** `IntroExperience.tsx`, `intro.css`, `LuxuryExperience.tsx` — Phase 3.2 is frozen (see
  its Freeze Note). 3.3 does not re-open it.

---

## 7. Validation

### 7.1 Technical
- [ ] Implements the frozen `LightDriver` interface unchanged; `channels === ["position"]` only.
- [ ] `modulate()` output is **hard-clamped** (property test: for any input, `|dx|,|dy| ≤ cap`; `dIntensity`
      is untouched/absent).
- [ ] **Zero frozen-file diff** — `git diff` across the engine, `FlameLightSource`, and the intro = **0**.
- [ ] **Detached determinism** — with the driver removed, rendered output is byte-identical to the 3.2 static
      baseline (Renderer Purity preserved).
- [ ] Renderer still owns **no** listener/rAF/timer/state (unchanged).
- [ ] Pointer listener is **passive**, coalesced to ≤ one compositor write per frame, and **removed on
      unmount** (no leak).
- [ ] **Capability gate** — `dim`/`reduced` → driver never attaches (static light); `off` → no light.
- [ ] Uses the **`--lux-*`** experience namespace for the bend var; declares **no `--lx-*`** token.
- [ ] SSR-safe: no `window`/`document` access at import; no hydration mismatch.

### 7.2 Emotional (human review — separate from technical)
- [ ] **Subconscious test** — *"Does this read as an animation / does the light follow the cursor?"* If **yes
      → reject.**
- [ ] **Interaction Dominance Review** — *"Did moving the cursor become something you wanted to play with?"*
      Must be **No.** If reviewers start waving the cursor to watch the light, the interaction has become the
      feature → **reject.**
- [ ] **Decorative Necessity** — *"If the bend vanished, would you immediately notice?"* Must be **No.**
- [ ] **Light Dominance** — *"Did you notice the light/cursor before the content?"* Must be **No.**
- [ ] The light **leans**, never **arrives**; at rest it is perfectly still.

### 7.3 Browser
- [ ] Dim laptop · bright desktop · high-brightness mobile — the bend is imperceptible-but-warm, never poppy.
- [ ] **Touch / no-pointer devices** — no `pointermove` → no bend; light stays static (graceful).
- [ ] `prefers-reduced-motion: reduce` — no listener attached; light fully static.
- [ ] **Performance** — one compositor transform per frame, **no layout, CLS 0**, no jank; the light never
      appears to *chase* the cursor.

### 7.4 Rollback
Plain **`git revert`** — delete the composition driver + harness files and the single registration/export
line. Zero engine and zero intro impact (they were never touched).

---

## 8. Implementation sequence (disciplined — never combined; for the *approved* build, not this review)
1. **Commit 1** — the `cursorBendDriver` (composition layer) + unit/property tests. No placement.
2. **Commit 2** — Composition Validation harness proving the bend in isolation on a persistent test light.
3. **Emotional review** — subconscious + necessity + dominance gates (human).
4. **Commit 3** — freeze docs + rollback verification. **No live adoption in Phase 3.3.**

---

## 9. Constraints (binding)
- **No implementation. No code.** This document is the deliverable.
- **No engine modifications** — every frozen file stays byte-identical.
- **No new public APIs** unless proven reusable platform capability — and **none is added in 3.3** (the driver
  is composition-layer, consuming the frozen `LightDriver` type).
- **The frozen intro is not re-opened.**

---

## 10. 🔒 Platform Contract Verification
| Governance | Preserved? | How |
|---|---|---|
| **Platform Stability Rule** | ✅ | No frozen engine modified; composed via public APIs only. |
| **Platform Extension Rule** | ✅ | No new **engine** public API; the driver consumes the frozen `LightDriver` type from the composition layer. |
| **Composition Layer Contract** | ✅ | New driver lives in `lighting/composition/`, composes frozen engines via public APIs, exposes no new platform API, and may be deleted without changing engine behaviour. |
| **Driver Resolution Contract** | ✅ | `position` channel only · bounded delta · never replaces the source · accessibility is the final governor. |
| **Lighting Design Contract** (Focal Point · Light Dominance · absence before presence) | ✅ | Bend-not-follow, hard-clamped, capability-gated, subconscious by construction. |
| **Light Source Ownership Contract** | ✅ | Driver only modulates an existing source; no source → no wrapper → nothing to move. |
| **AmbientLight Renderer + Renderer Purity Contracts** | ✅ | Renderer untouched; dynamism lives entirely in the driver's bounded modulation, never in the renderer. |
| **Lighting Token Ownership Contract** | ✅ | Bend var is experience-owned `--lux-*`; no `--lx-*` token declared or mutated. |
| **Decorative Necessity Review** | ✅ | Explicit release gate — bend must pass *"would users notice its absence?"* → No. |
| **Interaction Dominance Review** *(new permanent gate)* | ✅ | Release gate — bend must pass *"did the cursor become something users wanted to play with?"* → No. |
| **ADR-0007 / 0008 / 0009 · Freeze Notes** | ✅ | No contract changed; intro Freeze Note honoured (not re-opened). |

**No engine contract changes. The review closes cleanly — no platform evolution required for Phase 3.3.**

---

## 11. Note on future promotion (explicitly deferred)
If Cursor Bend later proves valuable enough to become a **first-class engine driver** (registered in the
engine's public driver surface, and/or given a resolver seam so `resolveAmbientLight` composes drivers
directly), that is **Ambient Lighting Engine v1.2** — a **separate** governed evolution: new architecture
review · new ADR · regression verification · new freeze. Phase 3.3 deliberately stops short of it and stays
in the composition layer.

---

## 12. Assessment
This review demonstrates that **Phase 3.3 is a composition phase**: the Cursor Bend driver bends the existing
light purely by composing frozen public APIs through an experience-owned transform, changing **no** frozen
engine file and adding **no** engine public API. The single greatest risk — the cursor becoming a visible,
gimmicky animation — is designed out structurally (bend-not-follow · hard clamp · heavy damping ·
compositor-only · capability-gated · subconscious test + **Interaction Dominance Review** as hard reject
gates), not left to tuning.

**Stop. No implementation.** Awaiting explicit approval to begin the build sequence in §8.
