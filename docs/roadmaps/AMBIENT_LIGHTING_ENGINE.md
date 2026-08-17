# Phase 3 — Ambient Lighting Engine

A reusable, CSS-first platform for **decorative lighting** across Samorah. The objective is **not** "follow
the mouse" — it is to make the site feel *physically illuminated by the flame.* The engine separates the
**light** (presentation) from what **drives** it (source + optional modulators). Cursor is only one future
driver, never the architecture.

> **Status:** Phase 3.0 (architecture + dormant infrastructure). **Nothing is mounted or visible.** Built
> like the Flame Primitive: dormant, frozen, then placed in a later phase.

## Roadmap (numbering fixed)
```
3.0  Ambient Lighting Architecture   — tokens · config · renderer · sources · capability · API. No mount. → Freeze
3.1  Static Ambient Lighting         — the flame casts a still warm light (no movement). → Freeze
3.2  Cursor Influence                — cursor subtly BENDS the existing light (not follows). → Freeze
3.3  Scroll Influence                — the light breathes while scrolling (felt, not seen). → Freeze
3.4  CMS Lighting Profiles           — admin: disabled/subtle/premium/campaign/seasonal, no code. → Freeze
```

## Engine components (the renderer alone is the Primitive)
```
Ambient Lighting Engine
  ├── Light Source        — WHERE light originates + base intensity/color (canonical: the flame)
  ├── Light Renderer      — <AmbientLight> primitive: draws the light (presentation only)
  ├── Interaction Drivers — subtly MODULATE an existing light (cursor bend · scroll breathe). Deferred.
  ├── Capability Manager  — on / dim / off (governor; reuses detectMotionTier)
  ├── CMS Configuration   — profiles → presets
  └── Experience API      — how an experience declares "a source here, this profile"
```
Ownership stays **Presentation vs Experience**: the engine renders light and owns **no business logic and
no state loops**; experiences decide *where* a source lives; drivers only translate a signal → CSS vars.

---

## 🔦 Lighting Design Contract (permanent platform rules)

### Philosophy
**You should notice its absence before you notice its presence.** If a viewer says *"the cursor is
glowing,"* we have failed; they should only feel the site is *warmer*.

### Never build
Mouse spotlight / flashlight · exact glow-follow · huge radial gradients · fast easing · particle trails ·
lens flare · bloom · canvas · WebGL/Three.js. Always: CSS-first, subtle, slow, warm, capability-gated,
progressive enhancement.

### Focal Point Rule
> **The Ambient Lighting Engine must never become the primary visual focal point. Typography, product
> imagery and storytelling always remain visually dominant. Lighting exists only to reinforce emotional
> atmosphere.**

### Light Source Ownership Contract
> A **LightSource is the only authority** that determines whether a light exists.
> - If a source disappears, the `AmbientLight` renderer must **gracefully disappear with it.**
> - Drivers (Cursor, Scroll, Campaign, …) may **only modulate an existing** light source.
> - Drivers must **never create, nor keep rendering,** a light after its source is unavailable.

Encoded by `LightSource.isAvailable()` — the renderer renders nothing when a source is unavailable, no
matter what drivers are attached.

### Driver Resolution Contract
Multiple drivers may exist in later phases. They **modulate**, they never replace the source.
- **Channels:** each driver declares which it touches — `position`, `intensity`, `color` — and contributes
  a **bounded delta** (a per-driver cap).
- **Composition order (low → high):**
  `Source (base) → Profile/CMS preset → Scroll (intensity) → Cursor (position) → [global clamp] → ⛔ Accessibility / Capability Override (final, wins over all)`
- **Accessibility is a governor, not a driver:** reduced-motion forces *dim/static*, off-tier forces
  *none* — overriding every source and driver. It can never be out-voted.
- **Determinism:** with no drivers, a light == Source × Preset (fully static) — the 3.1 baseline.

### CMS Responsibility Contract
> CMS may configure **presentation values only** — profile, intensity, radius, color.
> CMS must **never control animation choreography, drivers, timing, or engine behavior.** Those are owned
> by the Ambient Lighting Engine.

### Coordinate System
- **Origin:** top-left of the light's **container**; `x → right`, `y → down`.
- **Space:** positions are **percentages of the container** (`{x:"50%", y:"40%"}`), not viewport-global —
  a hero light is hero-relative and stays put across breakpoints.
- **Container behavior:** the light renders `position:absolute` inside a `position:relative` container; it
  never escapes or affects layout (**CLS 0**).
- **Transform origin:** the light field centers on the source via `transform: translate(-50%, -50%)` at
  `(x,y)`; later movement is `transform` deltas (compositor, no gradient repaint).
- **Responsive:** `%` coordinates scale with the container; radius/intensity use relative units
  (`clamp`, `vmin`) + tier tokens, so the light scales down and dims gracefully on small screens.

---

## Configuration · Profiles · Capability
- `LightingProfile` (`disabled·subtle·premium·campaign·seasonal`) → `resolveLightingProfile()` → a complete
  **`LightingPreset`** (radius · intensity · falloff · color · blend). The **renderer is profile-agnostic** —
  it consumes resolved values only.
- `resolveLightingConfig()` is the CMS/settings seam (same pattern as `resolveFlameConfig`).
- `LightingTier` = `on | dim | off` via `detectMotionTier()`.

## Public API (planned surface)
`AmbientLight`, `LightingConfig`, `resolveLightingConfig`, `LightingProfile`, `LightingPreset`,
`resolveLightingProfile`, `LightingTier`, `LightSource` (+ `Static/Flame/Campaign/Custom` types),
`LightDriver`. Decorative: `aria-hidden`, `pointer-events:none`, never affects layout.

## Rollback
Fully additive under `lighting/` (+ one export line at Commit 4). Delete the folder / `git revert`. No
mount, no DB, no dependency. Governance rules recorded here + ADR-0008 (driver model canonical).
