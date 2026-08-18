# Samorah Luxury Platform — Architecture Index

A **navigation map** for the luxury experience platform — not technical detail (that lives in each doc
below), just how the pieces fit and where to read more. Start here when onboarding or extending the platform.

```
Luxury Platform
│
├── Luxury Experience Engine        (Phase 1 · 1.1)   — the cinematic intro + replay orchestration
├── Luxury Flame Primitive          (Phase 2)         — the canonical flame visual (single source of truth)
│     └── Signature Flame Adoption   (Phase 2.1)       — the intro adopts the Primitive
├── Ambient Lighting Engine         (Phase 3.0)        — reusable decorative lighting (frozen; dormant)
│
├── Motion Design System                              — shared durations · easing · warm-light tokens
├── Capability System                                 — motion tier (full/reduced/off) → per-engine tiers
└── Design Principles & Contracts                     — the governance that keeps it luxury
```

## Platform version — **Luxury Platform v1.0**
| Component | Version | State |
|---|---|---|
| Luxury Experience Engine | v1 | live (intro + replay) |
| Luxury Flame Primitive | v1 | live (canonical flame) |
| Ambient Lighting Engine | **v1.1** | frozen · dormant (self-referential color fix — ADR-0009) |

Bump a **component** version on a breaking/major change (e.g. Lighting Engine v2 for a new driver model);
bump the **platform** version when the component set changes materially. Documentation only — it becomes
invaluable once v2s appear.

## Engines & primitives
| Component | What it is | Read |
|---|---|---|
| **Luxury Experience Engine** | Isolated presentation layer: the Match Strike Intro + replay policy, feature-flagged and removable | [LuxuryExperience.md](LuxuryExperience.md) |
| **Luxury Flame Primitive** | The canonical Samorah flame (SVG + CSS); `variant="match"` etc. | [roadmaps/FLAME_PRIMITIVE.md](roadmaps/FLAME_PRIMITIVE.md) |
| **Signature Flame Adoption** | The intro adopts the Primitive as its flame (design evolution) | [roadmaps/SIGNATURE_FLAME_ADOPTION.md](roadmaps/SIGNATURE_FLAME_ADOPTION.md) |
| **Ambient Lighting Engine** | Reusable decorative lighting; flame as light source, cursor one future driver | [roadmaps/AMBIENT_LIGHTING_ENGINE.md](roadmaps/AMBIENT_LIGHTING_ENGINE.md) |

## Shared systems
- **Motion Design System** — `src/features/luxury-experience/engine/motion.tokens.{ts,css}`. Durations,
  easing, and the warm-light palette every engine derives from (no hardcoded values).
- **Capability System** — `engine/capability.ts` (`detectMotionTier`: full/reduced/off). Each engine maps
  this to its own tier (e.g. lighting `on/dim/off`), and accessibility always governs.

## Decision records (ADRs)
| ADR | Decision |
|---|---|
| [ADR-0007](adr/0007-homepage-flame.md) | Homepage flame prototype rejected (reserve the flame for signature moments) |
| [ADR-0008](adr/0008-ambient-lighting-engine.md) | Ambient Lighting Engine — canonical driver model + all lighting contracts |
| [ADR-0009](adr/0009-ambient-lighting-engine-v1-1.md) | Ambient Lighting Engine v1.1 — self-referential color fix (governed evolution) |

## Governing principles (the platform's "constitution")
Recorded in the docs above; the load-bearing ones:
- **Presentation vs Experience** — presentation components provide visual language; experiences own storytelling; neither absorbs the other.
- **Brand Exclusivity** / **Prove-in-Isolation** — a component earns its place and proves itself dormant before joining a signature experience.
- **Canonical Flame Contract** / **Canonical Experience Rule** — the flame's visual identity and the intro's emotional language change only by design review.
- **Lighting Design Contract** — lighting must *notice its absence before its presence*, never be the primary focal point; CSS-first, capability-gated.

## 🛡️ Platform Stability Rule
> Once a platform engine reaches **Frozen** status, subsequent phases must **compose with its public API**
> rather than modifying its internal implementation.
>
> Engine evolution requires: **a new architecture review · a documented ADR · regression verification · a
> new freeze.** Experience phases **consume** platform primitives — they do not extend or modify them.

This prevents platform erosion — the slow drift of *"let's just add one more prop"* or *"let's just tweak
`AmbientLight`"* that turns stable engines into tangled ones. A frozen engine changes only through its own
governed evolution cycle, never as a side effect of an experience phase.

## 🔁 Validation Reset Rule
When a platform **engine changes** after an experience has already been validated:
- **All visual validation performed before the engine evolution becomes invalid.**
- Experience validation **must restart from the earliest affected validation checkpoint.**
- Previous screenshots, recordings, and review decisions remain **historical artifacts only** — they must
  **not** be reused as release evidence.

(Practiced in Engine v1.1: the pre-v1.1 Phase 3.2 harness validation was discarded and Phase 3.2 restarts
from a fresh Commit 1 against the corrected engine.)

## 🧩 Platform Extension Rule
> New public APIs may be introduced **only when they provide reusable platform capability.** Platform
> engines must **not** expose public APIs that exist solely for a single experience, campaign, prototype, or
> temporary integration.
>
> Experience-specific requirements should be met through **composition using existing public APIs** wherever
> possible. A **new** public API is justified only if it satisfies at least one of: reusable across
> **multiple experiences · multiple products · future campaigns · or as a general platform capability.**
> Otherwise it stays **internal to the consuming experience.**

## 🧱 Composition Layer Contract
A **composition layer** (e.g. `lighting/composition/FlameLightSource.ts`) sits between engine and
experience — `Platform Engine → Composition Layer → Experience` — and is where cross-engine wiring lives so
engines stay pure and experiences stay thin. A composition layer:
- composes existing **frozen** platform engines **exclusively through public APIs**;
- does **not** modify engine internals;
- does **not** expose new platform APIs;
- **may depend on multiple engines** simultaneously;
- remains **independent from any individual experience** where practical;
- **may be deleted without changing engine behavior.**

## ✅ Platform Composition Checklist
Run at the **start of every architecture review** (answer before any code):
- [ ] Does this phase modify any **frozen engine**?
- [ ] Can this be achieved using **public APIs only**?
- [ ] Is a **new platform capability** actually required?
- [ ] Does this introduce a **reusable** capability (not single-use)?
- [ ] Can rollback remain a **simple `git revert`**?
- [ ] Does this preserve **all existing ADRs and platform contracts**?

## 🔒 Platform Contract Verification
The **mandatory closing section of every architecture review.** Verify the proposed phase against **all**
existing governance and state, for each, whether the phase **preserves** the contract:
- **ADRs** (0007 · 0008 · …)
- **Platform Stability Rule**
- **Platform Extension Rule**
- **Platform Composition Checklist**
- **Engine Contracts** (all Flame + Lighting contracts)
- **Freeze Notes**

If any contract would change, **stop the review** and document why a **platform evolution** — a new
architecture review + a new ADR + regression verification + a new freeze — is required *before* any
implementation. A review that cannot close this section cleanly does not proceed to code.

## 🕯️ Decorative Necessity Review
A **permanent, platform-wide release gate for every decorative experience layer** — Ambient Lighting today;
cursor light, page transitions, particles, and seasonal/campaign effects tomorrow.

> **"If this decorative layer disappeared, would users immediately notice?"** Desired answer: **No.**

If reviewers immediately notice its removal, the layer has become too important — it violates *absence
before presence* and must be dialed back or cut. This is the strongest confirmation that a decorative layer
reinforces the experience rather than competing with it. (Lighting has an additional, sharper companion:
the **Light Dominance Review** — "did you notice the light before the content?")

## Roadmap (current)
```
✅ Phase 1 · 1.1   Luxury Experience Engine · Replay Policy
✅ Phase 2         Luxury Flame Primitive
✅ Phase 2.1       Signature Flame Adoption (intro)
✅ Phase 3.0       Ambient Lighting Engine (architecture · frozen · dormant)
✅ Phase 3.1       Composition Proven (Flame→FlameLightSource→resolveAmbientLight→AmbientLight compose; harness)
➡ Phase 3.2       Signature Intro Static Light (the intro flame casts light — after validation)   ← next
➡ Phase 3.3–3.5   Cursor Bend · Scroll Breathe · CMS Profiles
➡ Phase 4+        Campaign Storytelling · Product Storytelling · Admin · Page Motion
```

> This index is a map, not a spec — keep it thin. When a new engine or ADR lands, add one row here and put
> the detail in its own doc.
