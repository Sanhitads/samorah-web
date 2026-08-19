# Phase 3.6 — First Persistent Ambient Lighting Placement · Architecture Review (NO CODE)

> **This is a composition and placement phase, not a lighting-engine or CMS phase.**

NO CODE. This review chooses the safest real production surface for the **first persistent ambient light**,
proves it composes through frozen public APIs, and creates the **real CMS consumer** — without implementing
CMS, modifying any frozen engine/experience, or adding a public API. Grounded in the app at HEAD `802ee9b`.

## Opening gate — Platform Composition Checklist
| Question | Answer |
|---|---|
| Does this phase modify any frozen engine? | **No** — composition only (§4, §12). |
| Can it be achieved with public APIs only? | **Yes**, plus one additive composition-layer source factory (sibling of `FlameLightSource`) — not a public API (§4). |
| Is a new platform capability required? | **No** (§4, §9). |
| Reusable, not single-use? | **Yes** — a static-source factory + a reusable persistent-ambient experience. |
| Rollback = simple `git revert`? | **Yes** (§14). |
| Preserves all ADRs/contracts? | **Yes** (§15). |

---

## 1. The actual consumer — surface selection (evidence-based)
Audited `src/app` routes. Candidate persistent visual surfaces and their risk:

| Surface | Evidence | Fit as *first* persistent light |
|---|---|---|
| **`/our-story`** | In-code: *"the signature editorial page … a first-person, reflective journal"*, `force-dynamic`, CMS-managed (Pages CMS). | ✅ **Recommended.** Single, stable, atmospheric editorial page; no product grid or commerce UI to compete with; the reader lingers (genuinely persistent); a warm glow reinforces the reflective brand mood. |
| `/the-people-behind-samorah`, `/journal` | Sibling editorial/story surfaces (Pages CMS / Composable Page). | ✅ Valid **alternates** if `/our-story` palette doesn't suit (confirmed in the browser gate, §13). |
| `/shop/[slug]` (PDP), `/collections/[slug]`, `/shop` | Product detail / grids. | ⛔ Product imagery must dominate — ambient light risks **Light Dominance** violation; conversion-critical. |
| `/` (homepage) | Already hosts the **signature Match Strike Intro**. | ⛔ Adding a second persistent ambient here competes with the signature moment; keep the homepage the intro's alone. |

**Why `/our-story` is safest:** it is the smallest, most stable, non-commerce surface where a barely-perceptible
warm glow is *additive-but-inessential* — exactly the profile for a first placement. It is not conversion-
critical, has no competing product media, and the reader's dwell time makes "persistent" meaningful. No
consumer was invented; `/our-story` is a real, existing editorial page.

## 2. Signature Intro protection
- The Phase 3.2 Match Strike Intro is **frozen** and is **NOT** touched, reopened, or used as the consumer.
- The persistent light attaches to `/our-story`, **never** the intro.
- Any future change to intro lighting requires **its own architecture review + re-freeze**.

## 3. What "persistent" means (precise)
| Question | Answer |
|---|---|
| When does the light exist? | While `/our-story` is the active route. |
| Which route/page owns it? | `/our-story` **page-local** — mounted in that page's composition only. |
| Survives normal page interaction? | Yes — it is a fixed background layer (scroll/clicks don't dismiss it). |
| Mount / unmount? | Mounts with the page; unmounts on navigation away. |
| Page-local or site-wide? | **Page-local.** NOT added to any layout; NOT global. |
| CMS-eligible later? | Yes — keyed `placement_key = "our-story-ambient"` (§8). |

**No global ambient light** is introduced. Site-wide would be technically convenient and architecturally
wrong (it would light commerce surfaces that must stay product-dominant).

## 4. Composition path (frozen public APIs only)
```
PersistentAmbient (experience, page-local)
   → createStaticLightSource(...)        ← additive COMPOSITION-LAYER factory (sibling of FlameLightSource)
   → resolveAmbientLight({ enabled: true, profile: "subtle" }, source)   ← frozen public API
   → <AmbientLight preset source />       ← frozen renderer, unchanged
```
- **`AmbientLight`, `resolveAmbientLight`, `resolveLightingConfig`, `LightingPreset`, `LightingProfile`,
  `LightSource`, `LightDriver`, `lighting/index.ts` — all UNCHANGED.**
- **The one addition:** a `createStaticLightSource` factory. The engine already **exports the
  `StaticLightSource` type** but ships **no factory** for it. Creating one in the composition layer
  (`lighting/composition/StaticLightSource.ts`, beside `FlameLightSource.ts`) **instantiates the existing
  frozen interface** — it is **composition, not engine evolution**: no engine file changes, nothing new is
  exported from `index.ts`. (Minimal alternative: the experience implements the `LightSource` interface inline.
  The composition factory is preferred for reuse and correct `kind: "static"` semantics.)

**No engine change is necessary. This is not platform evolution — STOP is not triggered.**

## 5. Ownership (exactly one owner each)
| Concern | Owner |
|---|---|
| placement · position · offset · layering · whether the light exists · composition · timing/choreography | **Experience** (`PersistentAmbient` on `/our-story`) |
| rendering · preset presentation semantics | **Lighting Engine** (`AmbientLight` + preset model) |
| source availability/existence | **LightSource** (`StaticLightSource.isAvailable()`) |
| capability / accessibility gating | **Capability system** (`resolveLightingTier`) |
| enabled / profile configuration (future) | **CMS** — configuration only; **CMS must NOT own placement** |

## 6. Visual purpose & emotional gates
**What does this light add?** On the reflective `/our-story` page, a persistent, *barely-perceptible* warm
glow makes the page feel like a quiet, candle-lit room the reader sits in — the same warmth as the flame,
now as ambient atmosphere reinforcing the intimate first-person narrative. It **reinforces the text; it is
never the subject.**

Permanent gates (confirmed in the browser review, §13):
- **Emotional Parity** — the page still reads as the editorial story; the glow is atmosphere, not decoration-on-top.
- **Light Dominance** — *"noticed the light before the words?"* → must be **No**.
- **Layer Dominance** — text/imagery dominate; the light sits behind, never merging with content.
- **Decorative Necessity** — *"if it disappeared, would the reader immediately notice?"* → desired **No**.

If the light becomes the subject rather than reinforcing it, **reject the placement** (or move to an alternate
editorial surface). *Palette caveat:* the glow reads best on a darker/warm section; the browser gate must
confirm `/our-story`'s actual palette suits it, else use an alternate (§1) or a specific dark section.

## 7. Interaction capability decision — **START STATIC**
| Capability | Decision |
|---|---|
| Static only | ✅ **Yes — the entire scope of 3.6.** |
| Cursor Bend | ⛔ No — it is **validation/reference only**, not adopted; it cannot be placed in production. |
| Scroll Breathe | ⛔ No — adopted/dormant, but **adoption ≠ placement**; attaching it needs **its own** placement review. |

The first persistent placement proves the **static** composition + CMS-consumer path with the least risk. Any
interaction (e.g. Scroll Breathe on this page) is a **separate, later, independently-justified** placement
review — never automatic because the capability exists.

## 8. CMS relationship (define, do NOT wire)
This placement is the **first real CMS consumer**. 3.6 does **not** implement CMS — it **hard-codes**
`resolveLightingConfig({ enabled: true, profile: "subtle" })` (exactly as the intro hard-codes `premium`).
When CMS is implemented (post-3.6), it will supply the already-approved record for this placement:
```
{ placement_key: "our-story-ambient", enabled: <bool>, profile: <LightingProfile> }
```
CMS supplies only `enabled` + `profile`. CMS must **NOT** control position, radius, intensity, falloff, blend,
drivers, timing, animation, layering, or choreography — those remain the experience's/engine's. **No generic
lighting JSON.** The experience always owns placement.

## 9. Static preset decision — **existing `subtle` profile**
Use the **frozen `subtle` profile** (`intensity 0.1`, `radius clamp(120px,28vmin,360px)`, `soft-light`) — the
most restrained existing preset, correct for a persistent *background* glow (`premium` is the intro's louder
signature; `subtle` better satisfies Decorative Necessity here). **No new `LightingPreset` is created.** *(If
the browser review proved `subtle` insufficient, a new/edited preset would be a **code/design decision on the
engine's preset table — STOP and classify as engine evolution**, not a silent addition. Not anticipated.)*

## 10. Accessibility & capability
Chain: **Capability → availability → rendering.**
- **Finding:** the existing pre-paint `html[data-lux-tier]` attribute is set by `LuxuryExperience`, which is
  mounted **only on the homepage** — so `/our-story` does **not** inherit it. The persistent light therefore
  carries **its own minimal capability gate**: a small client wrapper renders `<AmbientLight>` only when
  `resolveLightingTier()` permits (`off → no light`). This is experience wiring, **not** an engine change.
- **reduced-motion:** the light is **static** — no animation loop, no driver — so reduced-motion introduces
  **no movement** and is trivially satisfied.
- **Capability/accessibility is the FINAL authority:** `off` tier → no light, regardless of config; no
  decorative effect can override the governor.
- **Interaction is excluded from 3.6** (explicitly, §7) — there is no motion to govern beyond existence.

*(To avoid an off-tier hydration flash, the gate may render nothing on the server and mount the light after
the client tier check — acceptable for a decorative, absence-before-presence layer.)*

## 11. Performance & layout
- **Compositor-safe:** `AmbientLight` is `position:absolute`, `pointer-events:none`, `aria-hidden`, a radial
  gradient with `opacity`/`mix-blend-mode` — no layout, **CLS 0**.
- **No animation loop:** static; no rAF, no driver, no listeners.
- **SSR/hydration:** `AmbientLight` is a pure, deterministic, hook-free component; the only client code is the
  tiny capability gate (§10). No hydration mismatch (the gate renders deterministically post-check).
- **Bundle impact:** minimal — `AmbientLight` + the static-source factory + a small wrapper + CSS. **No new
  dependencies.**

## 12. Files
**Would change (implementation — all additive except a minimal page mount):**
- NEW `lighting/composition/StaticLightSource.ts` — `createStaticLightSource` (composition-layer factory).
- NEW `experiences/persistentAmbient/PersistentAmbient.tsx` — the placement experience (capability gate →
  compose static source → `resolveAmbientLight({enabled:true, profile:"subtle"})` → `<AmbientLight>`).
- NEW `experiences/persistentAmbient/persistentAmbient.css` — background-layer wrapper (position/layering).
- NEW `experiences/persistentAmbient/*.test.ts(x)` — composition/SSR/capability/determinism tests.
- EDIT `src/app/(store)/our-story/page.tsx` — mount `<PersistentAmbient/>` behind the editorial content
  (minimal additive JSX; no change to data fetching). *(A normal store page — NOT a frozen experience.)*

**MUST NOT change:**
- All frozen engine files: `AmbientLight.tsx`, `resolveAmbientLight`/`experience.ts`, `lighting.config.ts`,
  `sources/lightSource.ts`, `drivers/driver.ts`, `capability.ts`, `lighting.css`, `lighting.tokens.css`,
  **`lighting/index.ts`**.
- The Match Strike Intro: `IntroExperience.tsx`, `intro.css`, `LuxuryExperience.tsx`.
- Cursor Bend validation/reference: `experiences/_validation/cursorBend/*`.
- Scroll Breathe adopted module: `interactions/scrollBreathe/*` (unless a genuine defect is proven — none is).
- **No CMS files** are created in 3.6.

## 13. Validation plan (approve before any implementation)
1. **Surface/palette confirmation** — verify `/our-story`'s actual palette suits a warm glow (else alternate, §1).
2. Technical tests (composition via frozen APIs; static-source factory conformance).
3. SSR/hydration validation (no mismatch; gate deterministic).
4. Accessibility/capability validation (`off → no light`; reduced-motion → no movement; governor final).
5. Performance validation (CLS 0; no layout; no animation loop; bundle delta recorded).
6. Browser visual review, then the gates: **Emotional Parity → Light Dominance → Layer Dominance →
   Decorative Necessity** (Interaction Dominance N/A — static).
7. Rollback rehearsal (§14).
8. Freeze.

No implementation proceeds until this plan is approved.

## 14. Rollback — plain `git revert`
Removing the placement reverts the additive files + the one-line page mount. It **does not affect**: the
lighting engine (untouched), the intro (untouched), Cursor Bend (untouched), Scroll Breathe (untouched). **No
CMS rollback** is needed because CMS is not implemented. `/our-story` returns to its exact current state.

## 15. Contract Verification
| Contract | Status |
|---|---|
| Platform Stability Rule | ✅ no frozen engine modified. |
| Platform Extension Rule | ✅ no new public API; the static-source factory is internal composition. |
| Platform Composition Checklist | ✅ passed (opening gate). |
| Composition Layer Contract | ✅ `createStaticLightSource` composes the frozen interface, deletable. |
| CMS Responsibility Contract | ✅ CMS (future) supplies `{enabled, profile}` only; experience owns placement. |
| Lighting Design Contract | ✅ `subtle` profile; absence-before-presence; Light Dominance gate. |
| Light Source Ownership | ✅ `StaticLightSource.isAvailable()` is the sole existence authority. |
| Driver Resolution | ✅ N/A — static, no driver. |
| Renderer Purity | ✅ `AmbientLight` consumes resolved preset + source only. |
| Experience Ownership | ✅ `/our-story` experience owns placement; only an experience composes `<AmbientLight>`. |
| Public API Stability | ✅ `lighting/index.ts` unchanged. |
| Decorative Necessity · Interaction Dominance | ✅ Decorative Necessity a hard gate; Interaction Dominance N/A. |
| Movement Budget · Scroll Idle Rule | ✅ untouched (no drivers placed). |
| Canonical Experience Rule | ✅ intro not reopened. |
| ADR-0007 / 0008 / 0009 | ✅ preserved. |
| **3.0 · 3.1 · 3.2 · 3.3 · 3.4 remain frozen** | ✅ none reopened to facilitate 3.6. |

## 16. Final decision
### ➡ **A — APPROVE IMPLEMENTATION OF FIRST PERSISTENT PLACEMENT**

The smallest, safest, reversible placement — **static · `subtle` · page-local on `/our-story` ·
capability-gated · no driver** — is fully achievable through the **frozen public APIs plus one additive
composition-layer static-source factory**, with **no engine change, no public API, no CMS, and no modification
of any frozen experience.** It creates the **real CMS consumer** (`placement_key: "our-story-ambient"`) that
Phase 3.5 was waiting for.

- **Not B (revise):** the architecture is sound; the only open item (palette fit) is a browser-gate decision
  with named alternates, not an architectural flaw.
- **Not C (platform evolution):** nothing in the frozen engine or public API is insufficient — the
  `StaticLightSource` type already exists; only a composition factory (or inline impl) is added.

**Scope discipline:** static only, one surface, one existing profile, no interaction, no CMS wiring. Any
enhancement (interaction on this page, additional surfaces, CMS) is deferred to its own review.

**NO CODE. NO CMS IMPLEMENTATION. NO ENGINE CHANGE. NO NEW PUBLIC API. NO MODIFICATION OF FROZEN EXPERIENCES.**
Awaiting approval to begin implementation under the §13 plan.
