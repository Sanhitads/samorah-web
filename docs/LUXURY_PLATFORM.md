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
| Ambient Lighting Engine | v1 | frozen · dormant (Phase 3.0) |

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

## Roadmap (current)
```
✅ Phase 1 · 1.1   Luxury Experience Engine · Replay Policy
✅ Phase 2         Luxury Flame Primitive
✅ Phase 2.1       Signature Flame Adoption (intro)
✅ Phase 3.0       Ambient Lighting Engine (architecture · frozen · dormant)
➡ Phase 3.1       Static Ambient Lighting (flame casts light)   ← next, awaits approval
➡ Phase 3.2       Cursor Influence · 3.3 Scroll · 3.4 CMS Profiles
➡ Phase 4+        Campaign Storytelling · Product Storytelling · Admin · Page Motion
```

> This index is a map, not a spec — keep it thin. When a new engine or ADR lands, add one row here and put
> the detail in its own doc.
