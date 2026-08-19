# Lighting Capability Review (Phases 3.0–3.4)

> **This is a platform capability review, not an implementation phase.**

An architecture/audit review — **NO CODE, NO REFACTORING, NO NEW GOVERNANCE, NO NEW PUBLIC API.** Its purpose
is to verify the lighting platform accumulated through Phases 3.0–3.4 is one coherent system before deciding
whether Phase 3.5 (CMS Profiles) is justified. Findings are grounded in the repository at the time of review
(HEAD `f496155`).

## Opening gate — Platform Composition Checklist
| Question | Answer |
|---|---|
| Does this review modify any frozen engine? | **No** — audit only. |
| Can the accumulated work be achieved using public APIs only? | **Yes** (verified §2, §6, §8). |
| Is a new platform capability required? | **No** (verified §8). |
| Does anything introduce a reusable single-use API? | **No** — no new public API exists (§8). |
| Can rollback of every phase remain a simple `git revert`? | **Yes** (each phase rehearsed). |
| Do all ADRs and contracts remain preserved? | **Yes** (verified §14). |

---

## 1. Ambient Lighting Engine v1.1
| Property | Finding |
|---|---|
| **Frozen status** | ✅ Frozen (ADR-0009, Accepted). Frozen-file diff across 3.0→3.4 = **0** lines. |
| **Public API** | ✅ `lighting/index.ts` exports only: `AmbientLight`, config/profile resolvers + types, `resolveLightingTier`, `LightSource` types, `LightDriver`/`LightChannel`/`LightModulation` types, `resolveAmbientLight`. No driver *implementations*, no cursor/scroll/CMS surface. |
| **Renderer purity** | ✅ `AmbientLight({preset, source, className})` — no driver props; returns `null` unless `preset && source.isAvailable()`; owns no state/listeners/rAF/timing. |
| **Preset/profile model** | ✅ `LightingProfile` (disabled·subtle·premium·campaign·seasonal) → `resolveLightingProfile` → `LightingPreset` (radius·intensity·falloff·color·blend). Renderer is profile-agnostic. |
| **LightSource ownership** | ✅ `LightSource.isAvailable()` is the sole existence authority; renderer disappears with the source. |
| **Capability governor** | ✅ `detectMotionTier` (single source, `engine/capability.ts`) → `resolveLightingTier` (on/dim/off). Governor is final. |
| **Coordinate system** | ✅ container-relative `%`, `position:absolute` in a `position:relative` container, `translate(-50%,-50%)`, CLS 0. Unchanged. |
| **Token ownership** | ✅ Only `lighting.tokens.css` **declares** `--lx-*` (8 tokens); `lighting.css` only **consumes** them (the lone grep hit there is a comment). Experience layers use `--lux-*`. |
| **CMS responsibility boundary** | ✅ `resolveLightingConfig` is the presentation-config seam (ADR-0008); no choreography/driver/timing surface exists in the engine. |

**Verdict:** the engine is intact, minimal, and frozen. No pressure has been absorbed to add driver props to
`AmbientLight`, driver awareness to `resolveAmbientLight`, or cursor/scroll/CMS knowledge to the engine.

## 2. Phase 3.1 — Composition Proven
- Chain `Flame → FlameLightSource → resolveAmbientLight() → AmbientLight` composes through **frozen public
  APIs only** (`createFlameLightSource` is a composition-layer factory; the rest are barrel exports).
- **No engine-specific exceptions** were introduced: `resolveAmbientLight` still takes `(config, source)`;
  no driver parameter, no back-door.
- **Verdict:** ✅ composition contract holds unchanged.

## 3. Phase 3.2 — Signature Intro Ambient Illumination
- ✅ Remains an **experience composition** — `IntroExperience` is the **only** production composer of
  `<AmbientLight>` (single production light).
- ✅ The **intro owns** position/offset/layering (Spatial Ownership) and timing; the engine owns only light
  rendering.
- ✅ **No later capability leaked into the frozen intro** — no cursor/scroll/driver/interaction references in
  `experiences/intro/` (the one `cursor:` hit is the CSS `cursor: default` style, unrelated to Cursor Bend).
- ✅ Its freeze remains valid (intro files unchanged since the 3.2 freeze; Freeze Note forbids in-place tweaks).

## 4. Phase 3.3 — Cursor Bend
- **Status recorded: VALIDATION / REFERENCE IMPLEMENTATION ONLY.**
- ✅ **NOT adopted, NOT attached to production** — lives in `experiences/_validation/cursorBend/`; imported by
  **nothing** outside `_validation/` (only its own tests). Zero shipped-bundle footprint.
- ✅ **Movement Budget bounded** — `MOVEMENT_BUDGET_PX = 6`, `clampToBudget` symmetric ±6px.
- ✅ **Outside the Lighting Engine** — not under `lighting/`, not in `index.ts`.
- ✅ **Harness/reference remains isolated** — untouched across 3.4 (diff 0); frozen reference per CURSOR_BEND.md §13.

## 5. Phase 3.4 — Scroll Breathe
- **Status recorded: ADOPTED / REUSABLE / DORMANT / NOT ATTACHED / NOT ROUTED / NOT USER-VISIBLE.**
- ✅ **Internal, not in `lighting/index.ts`** — lives in `interactions/scrollBreathe/`; imported by nothing
  (truly dormant; zero shipped-bundle refs).
- ✅ **Production placement still requires a new architecture review** (SCROLL_BREATHE.md §14 Freeze Note;
  capability adoption ≠ placement).
- ✅ **Breath Budget** (`BREATH_BUDGET = 0.06`, `clampToBreath` one-directional [0, 0.06]) and **Scroll Idle
  Rule** (idle-timer return to neutral, once, no oscillation) intact.

**Status-distinctness confirmed:** Cursor Bend = *validation/reference*; Scroll Breathe = *adopted/dormant*.
The two are **not** described as equivalent statuses anywhere (§12).

## 6. Cross-capability composition — architectural proof
Static Light + Cursor (position) + Scroll (intensity) coexist **without modifying the frozen engine**:

| Requirement | Evidence |
|---|---|
| Cursor affects **position only** | `cursorBendDriver` `channels: ["position"]`, emits `{dx,dy}`. |
| Scroll affects **intensity only** | `scrollBreatheDriver` `channels: ["intensity"]`, emits `{dIntensity}`. |
| Channels **orthogonal** | position → wrapper `transform`; intensity → wrapper `opacity`. Disjoint CSS properties on one experience wrapper. |
| **Driver priorities** consistent with the frozen Driver Resolution Contract | Scroll `priority: 10` resolves before Cursor `priority: 20` — matches `Source → Preset → Scroll(intensity) → Cursor(position) → clamp → a11y`. |
| Both effects **bounded** | Movement Budget (±6px) · Breath Budget (≤0.06). |
| **Accessibility/capability final** | governor forces dim/off, overriding drivers; drivers attach only at tier `on`. |
| **No driver replaces the LightSource** | drivers read no source, create no light; `isAvailable()` remains sole authority. |
| **No driver is the source of truth** | drivers emit bounded *deltas* only. |
| **No renderer changes required** | both apply via experience-owned `--lux-*` wrappers; `AmbientLight` untouched. |

The static baseline (no drivers) is exactly `Source × Preset`. Each driver is an **additive bounded delta on
an orthogonal channel**, applied outside the renderer. **They are three cooperating layers, not competing
control systems.** ✅ *(The frozen Cursor Bend harness was NOT modified to make this proof easier — the proof
rests on the already-frozen `crossDriver.test.ts` evidence and the drivers' declared channels/priorities.)*

## 7. Duplication / erosion audit (findings only — no refactor)
| Area | Finding | Severity |
|---|---|---|
| Movement-budget vs intensity-budget logic | Two modules (`movementBudget.ts` ±px symmetric; `breathBudget.ts` [0,0.06] one-directional). The `clamp*` **shape** is similar but the **semantics differ** (symmetric vs one-directional). Both are deliberate instances of the permanent Movement Budget *rule*. | **Intentional, not erosion.** No shared abstraction warranted yet. |
| rAF lifecycle machinery | Both drivers implement the same *pattern* (passive listener → rAF-coalesce → flush → detach). | **Duplicated pattern, contained.** Extraction is premature — it would couple the frozen Cursor Bend reference with the adopted Scroll Breathe module. **Watch item:** if a 3rd driver appears, consider a shared "bounded rAF-coalesced driver" base. |
| Capability gating | Single source: `detectMotionTier → resolveLightingTier`. Gating is applied by the *experience/probe*, not embedded in drivers. No duplication. | ✅ Clean. |
| Pointer/scroll listeners | Cursor owns `pointermove`/`pointerleave`; Scroll owns `scroll`. No overlap. | ✅ Clean. |
| Token namespaces | `--lx-*` declared only in `lighting.tokens.css`; `--lux-*` for experiences. | ✅ Clean. |
| Engine-specific workarounds / experience-specific public APIs / copied engine logic | **None found.** No back-doors into the engine; no experience-specific exports; no copies of frozen engine code. | ✅ Clean. |

**Observation (dormant-module gap, for the placement phase, not a defect):** the adopted Scroll Breathe module
does **not** embed capability gating — that gating lived in the now-removed validation Probe. This is
architecturally correct (gating is the experience's responsibility), but **the future placement phase must
wire `resolveLightingTier` gating** when it attaches the driver. Recorded so it is not forgotten.

## 8. Public API audit
**Question: "Can the current roadmap be completed through composition without adding another lighting public
API?"**

**Answer: YES.**
- **First Persistent Placement (3.6):** composes a `StaticLightSource`/`FlameLightSource` + `resolveAmbientLight`
  + `<AmbientLight>` — existing public APIs.
- **Cursor Bend / Scroll Breathe placement:** experience-owned `--lux-*` wrappers + the frozen `LightDriver`
  type — no new export.
- **CMS Profiles (3.5):** the presentation-config seam already exists — `resolveLightingConfig` +
  `LightingProfile` + `LIGHTING_PRESETS`. CMS selects/updates *values*, not behaviour.

No reusable platform capability is missing. **No new lighting public API is required for the current roadmap.**

## 9. CMS readiness question
| Question | Answer |
|---|---|
| What does CMS need to control? | Presentation values of a persistent ambient light: **profile** selection and the exposed `LightingPreset` fields (color, intensity, radius, falloff, blend). |
| Why does that belong in CMS? | Seasonal/campaign atmosphere changes without a code deploy — the `campaign`/`seasonal` profiles were designed for exactly this. |
| Which values are presentation configuration? | color · intensity · radius · falloff · blend · profile. |
| Which must remain owned by experience/code? | position/offset/**layering** (Spatial Ownership) · choreography/**timing** · **driver** attachment · *which* experiences get a light · the intro's frozen signature values. |
| CMS control profile/color/intensity/radius without choreography? | **Yes** — via `resolveLightingConfig`/`LightingProfile`, presentation only. |
| Can CMS ever control drivers? | **No** (CMS Responsibility Contract). |
| Can CMS control timing? | **No.** |
| Can CMS create arbitrary new lighting behavior? | **No** — only select among predefined profiles/values. |
| Does CMS require a new public API? | **No** — the config/profile seam already exists. |
| Is there a real reusable use case **today**? | **Not yet.** See the finding below. |

**Critical finding — CMS has no production consumer today.** The **only** production light is the Phase 3.2
**signature intro**, which is a **frozen brand moment and must NOT be CMS-configurable**. No persistent,
CMS-eligible ambient light exists yet (that is Phase 3.6). Building CMS Profiles now would configure the
presentation of lights that are not placed — configurability without a consumer, i.e. the exact
over-engineering risk to avoid. The CMS Responsibility Contract is **preserved** by this reading (CMS =
presentation values only), but the **scope and sequencing** of 3.5 must be settled first (see §13).

## 10. Production placement audit
- ✅ **Scroll Breathe has NO production placement** — zero importers, zero shipped-bundle refs, not routed.
- ✅ **Adopting the capability did NOT authorize placement** (SCROLL_BREATHE.md §14, LUXURY_PLATFORM.md).
- ✅ Any future placement requires: **Architecture Review → Placement Decision → Browser/Emotional Review →
  Validation → Freeze** (recorded).

## 11. Performance / accessibility audit — evidence tiers
| Guarantee | Tier |
|---|---|
| rAF coalescing (≤ one update per frame) | **Mechanically verified** (flood tests: 500 events → 1 update). |
| One frame maximum in flight | **Mechanically verified** (tests assert `rafMap.size === 1`). |
| No pointer/scroll-handler layout reads | **Mechanically verified** (read-count tests: 0 in handler, 1 in flush). |
| Bounded movement / bounded breath | **Mechanically verified** (budget clamp property tests). |
| Reduced-motion / capability governance | **Mechanically verified** (tier-gate tests) + CSS `prefers-reduced-motion` rules. |
| Compositor-only transform/opacity (no repaint/layout, CLS 0) | **Analytically established** (transform/opacity are compositor properties; CSS avoids `filter`). |
| Subconscious / non-pulsing feel | **Browser-verified** (Phase 3.4 human review — Adopt). |
| FPS / CPU / memory numbers | **Not measured** — no empirical profiler capture exists (recorded as a known limitation). |

## 12. Documentation consistency audit (report only — no rewrite)
**No status contradictions found.** Cursor Bend is uniformly *validation/reference/isolation/frozen/not
adopted*; Scroll Breathe is uniformly *adopted/reusable/dormant/frozen/not placed*. The two are never treated
as equivalent statuses. ADRs 0007/0008/0009 present; 0009 Accepted (engine re-frozen v1.1).

Minor observations (non-blocking, do not fix during this review):
- **Title drift:** `CURSOR_BEND.md` and `SCROLL_BREATHE.md` are titled *"…Architecture Review (NO CODE)"* but
  have since accreted implementation status + Freeze Notes (they became each phase's living record). Titles
  understate current scope.
- **Review-artifact naming:** `docs/reviews/phase-3.4/README.md` and `VERDICT.md` retain *"Scroll Breathe
  **Validation**"* in their titles while the phase concluded in *adoption*. Accurate as a record of the
  browser review that occurred, but a reader could misread the current status. (The authoritative status is
  the Freeze Note + roadmap.)

## 13. Governance decision
### ➡ **B — READY FOR PHASE 3.5 ARCHITECTURE REVIEW, BUT CMS SCOPE MUST BE REFINED**

The platform is **coherent and holding**: the engine is minimal and frozen, the composition pattern
(`Engine → Composition → Experience`) is reused cleanly by both drivers with no erosion, statuses are
correct, and **no new public API or platform evolution is required** for the roadmap. This is **not** outcome
C — no frozen engine or public API is insufficient.

It is **not** outcome A because **CMS Profiles is not yet justified as an implementation**: there is **no
production consumer** for CMS-controlled lighting today. The one production light is the frozen signature
intro (not CMS-eligible); the first CMS-eligible persistent light is Phase 3.6, which does not exist yet.

**Required refinement before any 3.5 code (to settle in the 3.5 architecture review):**
1. **Define the consumer.** CMS Profiles needs a placed, CMS-eligible persistent light to configure. Decide
   whether **3.6 (First Persistent Placement) should precede or co-scope 3.5** — configuring nothing is
   over-engineering.
2. **Fix the exact CMS value set.** Explicitly enumerate which `LightingPreset` fields CMS may set
   (profile · color · intensity · radius · falloff · blend) and confirm CMS touches **nothing** else
   (position/layering/timing/drivers).
3. **Confirm the seam.** CMS rides `resolveLightingConfig` / `LightingProfile` — **no new lighting public
   API**. The 3.5 review must reaffirm this.
4. **Reaffirm exclusions.** CMS may never control choreography, drivers, timing, engine behaviour, or
   experience ownership (CMS Responsibility Contract).

## 14. Contract Verification (closing gate)
| Contract | Status |
|---|---|
| Platform Stability Rule | ✅ engines/modules changed only through governed freezes. |
| Platform Extension Rule | ✅ no new public API; Scroll Breathe kept internal. |
| Platform Composition Checklist | ✅ passed (opening gate). |
| Contract Verification (per-phase) | ✅ all phases closed cleanly. |
| Composition Layer Contract | ✅ `FlameLightSource` + drivers compose via public APIs, deletable. |
| Lighting Design Contract | ✅ absence-before-presence upheld; no focal-point drift. |
| Light Source Ownership Contract | ✅ `isAvailable()` sole authority; no driver usurps it. |
| Driver Resolution Contract | ✅ channels orthogonal; priorities 10<20; bounded; a11y final. |
| Renderer Purity | ✅ `AmbientLight` deterministic, prop-stable. |
| Experience Ownership | ✅ only `IntroExperience` composes `<AmbientLight>` in production. |
| CMS Responsibility Contract | ✅ preserved; the §9 reading keeps CMS to presentation values only. |
| Decorative Necessity | ✅ permanent gate intact. |
| Interaction Dominance | ✅ permanent gate intact. |
| Movement Budget | ✅ bounded (±6px). |
| Scroll Idle Rule | ✅ intact (return once, no oscillation). |
| Canonical Experience Rule | ✅ intro reopened only under governance (3.2), re-frozen. |
| ADR-0007 (homepage flame rejected) | ✅ preserved. |
| ADR-0008 (engine + driver model) | ✅ preserved. |
| ADR-0009 (engine v1.1 color fix) | ✅ preserved; engine re-frozen. |

**No contract requires change. No platform evolution required.**

---

## Summary
- The lighting platform (3.0–3.4) is **one coherent system**: a small frozen engine, a reused composition
  pattern, two bounded orthogonal interaction capabilities (one validation-only, one adopted-dormant), and a
  single frozen production light.
- **No duplication of concern, no erosion, no missing public API.**
- **Recommendation: B — proceed to a Phase 3.5 *architecture review* (not code), with CMS scope refined** —
  first define CMS's production consumer and exact presentation-value set. Do not begin 3.5 implementation.
