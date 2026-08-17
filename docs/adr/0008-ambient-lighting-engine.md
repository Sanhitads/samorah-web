# ADR 0008 — Ambient Lighting Engine

**Status:** Accepted (Phase 3.0 — architecture + dormant infrastructure; runtime impact: none)

## Context

Phase 3 introduces decorative lighting to the Samorah luxury platform. The naive path — "cursor lighting"
— would bake one input into the architecture and be rewritten later. Instead the goal is to make the site
feel **physically illuminated by the flame**, with cursor/scroll/campaign as *future, secondary* inputs.

This requires a **reusable engine** that separates the **light** (presentation) from what **drives** it,
and that never absorbs business logic, choreography, or state — so it stays maintainable as drivers,
profiles, and CMS control are added over the 3.0 → 3.4 roadmap.

## Decision

The **Ambient Lighting Engine** is the canonical platform for decorative lighting. Components:
**Light Source** (where light originates; the flame is one implementation) · **Light Renderer**
(`<AmbientLight>`, presentation only) · **Interaction Drivers** (bounded modulators; none built in 3.0) ·
**Capability Manager** (on/dim/off governor) · **CMS Configuration** (profiles → presets) · **Experience
API** (`resolveAmbientLight`). It is **CSS-first**, owns **no business logic and no state loops**, and is
**fully dormant** in Phase 3.0 (no mount, nothing visible).

This ADR is the canonical architectural reference; full detail lives in
[AMBIENT_LIGHTING_ENGINE.md](../roadmaps/AMBIENT_LIGHTING_ENGINE.md). The permanent contracts:

| Contract | Rule (one line) |
|---|---|
| **LightSource architecture** | Generic `LightSource` interface; Flame/Static/Campaign/Custom are implementations; the renderer consumes any source. |
| **Light Source Ownership** | A source is the sole authority for whether a light exists (`isAvailable()`); the renderer disappears with it. |
| **Driver Resolution** | Drivers only *modulate* (bounded, per-channel); order Source→Profile→Scroll→Cursor→clamp→**Accessibility Override** (governor, wins). |
| **Renderer Responsibility** | `AmbientLight` is presentation only; never owns timing/choreography/capability/replay/state/listeners/rAF/timers/drivers/sources. |
| **Renderer Purity** | Deterministic: same preset+source → identical output; no time/randomness/browser-state/hidden-state. |
| **Experience Ownership** | Only an Experience composes `<AmbientLight>`; renderer/source/driver never mount it; passive until composed. |
| **Lighting Token Ownership** | Only `lighting.tokens.css` declares `--lx-*`; components consume; no experience/page/campaign redefines tokens. |
| **CMS Responsibility** | CMS configures presentation values only (profile/intensity/radius/color); never choreography/drivers/timing/engine behavior. |
| **Coordinate System** | Container-relative %, origin top-left, centred via `translate(-50%,-50%)`, responsive relative units. |
| **Public API Stability** | `lighting/index.ts` is the only public entry point; internal files may refactor without breaking Experiences. |
| **Experience Resolver** | `resolveAmbientLight()` composes config/presets/sources only; never renders/animates/detects capability/owns drivers/replay/business logic. |

Design constraints (Lighting Design Contract): **notice absence before presence**; **never the primary
focal point** (typography/products/storytelling dominate); no spotlight/flashlight/glow-follow/bloom/lens-
flare/particles/canvas/WebGL; CSS-first, subtle, capability-gated.

## Consequences

- Cursor is one bounded driver, never the architecture — no rewrite when drivers are added.
- Every future placement (3.1 static → 3.2 cursor → 3.3 scroll → 3.4 CMS) plugs into stable seams.
- The engine cannot silently become a "mini-engine": renderer purity + resolver + ownership contracts keep
  responsibilities layered.
- Rollback is trivial (delete `lighting/`); Phase 3.0 ships **zero runtime impact.**
