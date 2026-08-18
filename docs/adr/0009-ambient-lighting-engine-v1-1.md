# ADR 0009 — Ambient Lighting Engine v1.1 (self-referential color fix)

**Status:** Accepted (Ambient Lighting Engine v1.1 — governed maintenance evolution of a frozen engine)

## Context

Phase 3.2 (Signature Intro Ambient Illumination) was the **first visual use** of the Ambient Lighting
Engine — earlier phases only rendered/tested its markup, never its pixels. That surfaced a latent defect:
the composed light rendered as a valid `.lx-light` element but was **transparent (invisible)**.

**Root cause:** A preset value referenced the same CSS custom property that the renderer emitted, creating
a self-referential custom property at computed-value time. Concretely, presets carried
`color: "var(--lx-color-warm)"`, and `AmbientLight` copies that value onto `--lx-color-warm` — producing
`--lx-color-warm: var(--lx-color-warm)`, which is invalid at computed-value time, so the gradient lost its
colour. The fix changes only the preset value to reference the shared design token, preserving renderer
purity and the public API.

The Phase 3.2 investigation localized the defect to the **engine** (not the composition layer, intro, or
Flame), so it was handled as a **governed engine evolution** under the Platform Stability Rule
(architecture review → ADR → regression → freeze) rather than patched inside the experience.

## Decision

**Option A** — presets contain concrete shared design tokens; the renderer stays a pure presentation copier.

- `lighting.config.ts`: `WARM = "var(--lux-color-amber)"` (the Motion Design System's shared amber token)
  instead of the engine's own `--lx-color-warm` variable. One-line value change.
- **`AmbientLight` renderer is unchanged** — it still copies `preset.color` verbatim; no token-resolution
  logic was introduced (Renderer Purity preserved).
- **Regression protection** (`RendererContract.test.ts`): (1) no emitted CSS custom property references
  itself — name-independent, across all profiles; (2) a golden renderer snapshot asserting the emitted
  style equals exactly the resolved preset values + source position; (3) the `LightingPreset` public shape
  is unchanged.

Option B (a renderer that resolves token names) was rejected: it would add logic to the renderer, violating
the Renderer Purity and Lighting Token Ownership contracts.

## Consequences

- The ambient light renders with a real colour; the engine is correct at first visual use.
- **No public API change** (the `LightingPreset` shape and `index.ts` exports are identical; only a private
  constant's value changed). **No experience, composition, or Flame changes.**
- **No production impact** — the engine is dormant (never mounted) and the Phase 3.2 harness defaults to
  Mode A, so nothing user-facing was ever affected.
- The engine is re-frozen at **v1.1**. This ADR amends ADR-0008 (it does not contradict it); all
  ADR-0008 contracts remain in force.
- **Rollback:** `git revert` the two v1.1 commits restores v1 with no downstream changes.
- The self-reference regression test now protects **future** tokens from the same class of defect.
