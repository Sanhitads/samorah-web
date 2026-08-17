# Luxury Flame Primitive — Phase 2

A reusable, decorative **design-system primitive** (not an "engine"): the canonical Samorah animated
flame. Pure **SVG + CSS**, zero JavaScript motion, drop it anywhere with one import. Built on the Phase 1
Luxury Experience Motion Design System; Phase 1 (intro + replay) is frozen and untouched.

> **Status:** Phase 2 **frozen** — reusable platform primitive, **no production mount**. A homepage-hero
> placement was prototyped and **deliberately rejected** (see below). **Phase 2.1 (Signature Flame Adoption)
> is complete** — the Match Strike Intro now renders the canonical Primitive (`variant="match"`).

---

## 🕯️ Brand Exclusivity Principle

> **The Luxury Flame Primitive should appear only where it creates narrative or emotional value. Reusing
> it in places where it becomes expected or decorative should be avoided, even if technically feasible.**

Part of the Samorah Luxury Design System — it guides every future luxury-experience decision. Two tenets:
- *"Every luxury interaction must earn its place. If removing it does not diminish the emotional experience, it should not exist."*
- *"Luxury is created through restraint, not abundance. Reusable components should become signature moments, not recurring decorations."*

**Precedent (Phase 2.1):** a homepage-hero flame was fully prototyped, then removed — not for any technical
reason, but to preserve the cinematic intro as *the* signature flame moment. A continuously visible homepage
flame would make that signature moment ordinary. The primitive is reserved for moments with narrative or
emotional weight (intro · campaigns · product storytelling).

## 🧪 Prove-in-Isolation Principle

> **Every new luxury component must first prove itself in isolation before becoming part of a signature
> experience.**

Primitive → prototype (dormant, no production impact) → review → keep *or* reject. The Flame Primitive
followed exactly this path (ADR [0007](../adr/0007-homepage-flame.md)): built standalone, prototyped on the
homepage behind an off-by-default switch, reviewed, and rejected — with zero risk to production. This
process is a permanent part of the Luxury Design System.

## 🧭 Presentation vs Experience Principle

> **Presentation Components provide reusable visual language. Experience Components provide storytelling.
> Neither layer should depend on or absorb responsibilities belonging to the other — Presentation never
> owns storytelling; Experience never owns visual language.**

The Flame Primitive is a **Presentation Component** — it supplies the visual flame (shape, palette, glow,
ambient idle motion, wick visibility) and nothing else. The Match Strike Intro is an **Experience
Component** — it owns storytelling (spark, ignition, glow timeline, the 2600 ms sequence, wordmark, fade,
replay). An Experience *composes* a Presentation component and drives *when* it appears; the Presentation
component never learns about the Experience's timeline. Cross-layer control happens through **supported,
high-level APIs** (e.g. a `match` variant), never through low-level rendering flags or by reaching into
the other layer's internal CSS or timing.

## 📜 Canonical Flame Contract

The **Luxury Flame Primitive is the single source of truth for the Samorah flame's visual identity.**
Every experience that adopts it — the Match Strike Intro, campaigns, product storytelling, loading
moments — renders the *same* canonical flame.

Therefore any change to the flame's **silhouette, proportions, glow, palette, or motion characteristics**
requires **explicit design review**: such a change is never local — it propagates to every adopting
experience at once. Bug fixes and *additive, backward-compatible* APIs (e.g. adding a `match` variant) do
not alter the canonical identity and are exempt; anything that changes how the flame **looks or moves** is not.

Enforced at release time by the **Cross-Experience Consistency** gate (see SIGNATURE_FLAME_ADOPTION.md):
the Intro, the standalone Primitive preview, and any demo usage must render the identical canonical flame.

## 🔒 Match Variant Contract

`variant="match"` is **reserved for experience-driven storytelling** — specifically the Match Strike intro.
It is **not** a generic decorative flame for general site use. Do **not** reach for `match` on a product
card, empty state, or campaign tile "because the wickless flame looks nice" — `classic` (or a future
purpose-built variant) is the canonical choice there.

**Canonical geometry:** `match` intentionally reuses the **canonical flame geometry** — the same body and
inner-core paths as `classic` — and differs **only by omitting the wick**. It must never diverge (thinner,
bluer, a different silhouette); if it did, Samorah would have two different flames. Any change to `match`'s
geometry, palette, or motion is a change to the canonical flame and falls under the Canonical Flame Contract.

## ⭐ Signature Components

Not every reusable component is *signature*. These carry the brand's emotional identity and **require
design review before any change** to their look or motion:

- **Flame** — the Luxury Flame Primitive (this document).
- **Match Strike** — the cinematic intro sequence.
- **Wordmark Reveal** — the SAMORAH wordmark animation.

Editing a signature component is never a local change — it changes how Samorah *feels*. Treat such edits
with the same rigor the Canonical Flame Contract applies to the flame's visual identity.

## 🎬 Canonical Experience Rule

> **The Match Strike Intro is the canonical implementation of the Samorah cinematic experience. Future
> experiences may reuse the Flame Primitive but must not redefine the emotional language established by the
> Match Strike Intro without explicit design review.**

Where the Canonical Flame Contract protects the flame's *visual* identity, this protects the intro's
*emotional* language — its timing, pacing, and strike-to-reveal arc — from slowly drifting as new
experiences are built. New experiences **compose** the primitive; they do not re-author the signature feeling.

---

## Public API

```ts
import { Flame } from "@/features/luxury-experience";

<Flame />                                   // classic · default theme · classic motion · md · glow
<Flame size="lg" motionProfile="signature" />
<Flame motionProfile="still" />             // static lit flame (also the reduced-motion result)
<Flame glow={false} size="sm" />
```

Also exported: `resolveFlameConfig`, `FLAME_DEFAULTS`, and the types `FlameConfig`, `FlameProps`,
`FlameVariant`, `FlameTheme`, `FlameMotionProfile`, `FlameSize`. `FlameSvg` stays internal.

`Flame` is a server component — **no client JS ships for it**; the markup is SSR'd and all motion is CSS.

---

## Configuration model — four independent layers

```
Flame → variant (silhouette) → theme (skin/palette) → motionProfile (motion)
```

| Prop | Values | Built in Phase 2 | Meaning |
|---|---|---|---|
| `variant` | `classic` · `match` · tall · short · ceramic · luxury | **classic + match** | shape only (`match` = classic body, no wick) |
| `theme` | `default` · light · dark · luxury · seasonal | **default** only | palette only |
| `motionProfile` | `still` · `classic` · `signature` | **all three** | motion only |
| `size` | `xs` `sm` `md` `lg` `xl` · number(px) | **all** | size (aspect-ratio fixed → CLS 0) |
| `glow` | boolean | ✅ | render the light radius |
| `sway` | boolean | ✅ | horizontal drift on/off |

Behaviour is driven by **CSS class modifiers** (`lux-flame--variant-*`, `--theme-*`, `--<motionProfile>`,
`--<size>`, `--no-sway`) — never by `if/else/switch` in render. `resolveFlameConfig(overrides)` is the
seam a future CMS/campaign layer merges into (same pattern as `resolveExperienceConfig`).

---

## 🔒 Luxury Motion Specification (do not exceed — candle, never torch/campfire)

| Parameter | Bound |
|---|---|
| Max sway | **2°** rotate · **≤1.5%** translateX (amplitude scaled per profile) |
| Opacity | **90–95%** (flicker never hard on/off) |
| Scale | **1.00–1.02** (micro `scaleY`) |
| Glow | **95–100%** of `--lux-flame-glow-opacity` |
| Easing | `--lux-flame-ease` (shared in-out) — no linear, no sudden changes |
| Colour | no hue shifts; warm palette fixed (`--lux-flame-core/amber`) |
| Anchor | `transform-origin: bottom center` (pinned at the wick) |

**Philosophy — no visible loop:** three animations at **different durations + phase offsets** —
sway **5.2s** · flicker **2.6s** · glow **3.6s** → a **combined cycle ≈ 47s** (LCM), with no JavaScript.
`signature` raises amplitude *within* these caps; it never exceeds them.

### SVG layer responsibilities (what may animate)
| Element | Responsibility |
|---|---|
| `.lux-flame__wick` | **Static anchor — never animated independently** (only the near-origin sway). |
| `.lux-flame__body` | Follows the global sway only. |
| `.lux-flame__inner` | The only independently animated SVG element — flicker (opacity + micro-scale). |
| `.lux-flame__glow` | Non-SVG layer — the glow pulse (absolutely positioned; never affects layout). |

**Reduced motion / `still`** → a static **lit** flame (steady glow, full opacity, no movement) — never hidden.

---

## Capability tier → Motion Profile (documented intent — NOT implemented in Phase 2)

| Tier | Device class | Motion Profile |
|---|---|---|
| Tier 1 | Desktop / `full` | Signature |
| Tier 2 | Laptop / standard | Classic |
| Tier 3 | Low-power / `prefers-reduced-motion` | Still |

Phase 2 ships `motionProfile` as an explicit prop (default `classic`); reduced-motion is handled purely
by CSS. Tier-driven auto-selection is a later phase — this table is the target so contributors converge.

---

## Non-Goals (Phase 2)

Intentionally excluded so they are never assumed done: physics simulation · particles/embers/smoke ·
JavaScript animation loop (rAF) · cursor/pointer interaction (Phase 3) · automatic capability-based
motion selection · CMS/DB integration · sound · production mounts · theme switching / seasonal themes ·
non-classic variants (tall/short/ceramic/luxury are typed, not drawn).

---

## Validation strategy

**Automated (committed regression suite — `Flame.render.test.ts`):** decorative semantics (aria-hidden,
no focusable nodes) · CSS-modifier application · size handling (token class vs numeric inline height) ·
motionProfile class assignment · **100-instance high-density** smoke test.

**Manual (browser — code can't prove these):** run the throwaway preview page below and confirm:
- [ ] 60fps with ~50–100 flames; no jank
- [ ] renders well on **light**, **dark**, and **photographic hero** backgrounds (glow legible everywhere)
- [ ] the glow reads as one coherent candle — it does not visually lag the flame
- [ ] reduced-motion → static lit flame (steady glow, not hidden)

### Throwaway preview page (local only — never commit or deploy)
```tsx
// src/app/(store)/_flame-preview/page.tsx  — delete after viewing
import { Flame } from "@/features/luxury-experience";
export default function FlamePreview() {
  return (
    <div style={{ display: "flex", gap: 48, alignItems: "flex-end", padding: 64, flexWrap: "wrap" }}>
      <Flame size="xs" /><Flame size="sm" /><Flame size="md" /><Flame size="lg" /><Flame size="xl" />
      <Flame motionProfile="signature" size="lg" />
      <Flame motionProfile="still" size="lg" />
      <Flame glow={false} size="lg" />
    </div>
  );
}
```

---

## Performance characteristics
- Only `transform` + `opacity` animate → **GPU-composited**, 60fps target; the glow gradient is static.
- **Zero client JS**, no re-renders, no timers/listeners/effects → no memory leaks, no main-thread cost.
- **CLS 0** — `aspect-ratio` reserves the box; the glow is absolutely positioned (never affects layout).
- Dense grids can drop cost via `motionProfile="still"` or `glow={false}`.

## Rollback
Fully additive under `flame/` + one export block in the feature `index.ts`. Delete the folder + revert
the export (and the docs), or `git revert` the four Phase 2 commits. No mount, no DB, no dependency.

---

## Roadmap
```
✅ Phase 1     Luxury Experience Engine                  (frozen)
✅ Phase 1.1   Replay Policy                              (frozen)
✅ Phase 2     Luxury Flame Primitive                     (frozen — reusable platform component)
❌ —           Homepage Hero placement — EVALUATED & REJECTED (deliberate brand decision; see the
               Brand Exclusivity Principle above). Homepage stays typography-led.
✅ Phase 2.1   Signature Flame Adoption (Intro Retrofit) — DONE. The intro now renders the canonical
               Primitive (`variant="match"`); Intro owns 100% choreography · Primitive is 100% presentation.
               An intentional design evolution (see SIGNATURE_FLAME_ADOPTION.md · Design Decision).
➡ Phase 3     Cursor-Reactive Warm Lighting — ONLY after the intro uses the Signature Flame.
➡ Phase 4     Campaign Storytelling (Diwali · Christmas · Anniversary · Limited Collections).
➡ Phase 5     Product Storytelling (craft · collection intros · editorial · luxury loading · checkout
               success · empty states) — never generic decoration.
➡ Phase 6     Luxury Experience Admin (Experiences · Campaigns · Themes · Scheduling · Analytics).
➡ Phase 7     Page Motion & Navigation Transitions.
```

## Future extension points
- **Variants** — add a silhouette by drawing one path set in `FlameSvg`; no API change.
- **Themes** — a theme overrides `--lux-flame-core/amber/glow` (+ optional `lux-flame--theme-*` CSS); seasonal campaigns live here, not as variants.
- **Wind** (Phase 3 — Cursor-Reactive Warm Lighting) — lighting sets `--lux-flame-wind`; consumed via a `var()` fallback, no JS in the primitive.
- **Tier auto-selection** — map `detectMotionTier()` → `motionProfile` per the table above.
- **CMS** — `resolveFlameConfig()` merges a campaign/settings layer with no engine change.
