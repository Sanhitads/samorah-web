# Phase 3.5 — CMS Lighting Profiles · Architecture Review (NO CODE)

> **This is a CMS architecture review, not a CMS implementation phase.**

NO CODE · NO migrations · NO CMS UI · NO database changes · NO public API changes · NO implementation. This
review determines *whether* and *how* CMS Profiles should exist, grounded in the frozen engine at HEAD
`43671e8`. The Lighting Capability Review concluded **B — ready for this review, but CMS scope must be
refined**; this review does the refining.

## Opening gate — Platform Composition Checklist
| Question | Answer |
|---|---|
| Does this phase modify any frozen engine? | **No** (recommended model uses the existing seam). |
| Can this be achieved with public APIs only? | **Yes** — `resolveLightingConfig` already accepts a `Partial<LightingConfig>` (`{enabled, profile}`). |
| Is a new platform capability required? | **No** (§6). |
| Reusable, not single-use? | **Yes** — the config seam already serves every future placement. |
| Rollback = simple `git revert`? | **Yes** (implementation, when it comes, is additive CMS data). |
| Preserves all ADRs/contracts? | **Yes** (§15). |

---

## 1. Sequencing — 3.5 CMS vs 3.6 First Persistent Placement
The engine's config seam is `resolveLightingConfig(overrides?: Partial<{enabled, profile}>)`. CMS would feed
it. But **what light would those profiles configure?**

| Option | Assessment |
|---|---|
| **A. Persistent placement first, then CMS implementation** | Safe, but skips defining the CMS contract while the design is fresh. |
| **B. CMS *architecture* now, implementation deferred until a real consumer exists** | ✅ **Recommended.** Define the contract now (this review); implement only once a placed, CMS-eligible light exists (via 3.6). |
| **C. CMS + first placement as one coordinated phase** | Rejected — bundles two design decisions (where a light lives *and* how it's configured) into one review, weakening both and risking a CMS panel built to a placement that hasn't been emotionally reviewed. |

**Recommended sequence:** `3.5 CMS architecture review (now) → 3.6 First Persistent Light (creates the
consumer) → CMS implementation against that real consumer`. This **combines the strengths of A and B**: define
the CMS contract now while the design is fresh (B), but implement only against the real use case that 3.6
reveals (A) — never speculatively. It rejects C (bundling placement + CMS in one phase). **Principle: do not
build configurability before there is a real production consumer.** The signature Match Strike Intro is
**not** a CMS consumer and remains excluded (§11).

## 2. The actual CMS consumer
**There is no valid CMS consumer today.** The only production light is the Phase 3.2 signature intro, which is
frozen and brand-locked (excluded by design). No persistent, CMS-eligible ambient light exists yet.

> **CMS implementation is not yet justified.** The correct answer is that **Phase 3.6 must establish the first
> persistent, CMS-eligible light first.** That placement — not this review — creates the consumer. No consumer
> is invented here to justify the phase.

*(Supporting finding: the `campaign` and `seasonal` presets are currently byte-identical clones of `premium`
— placeholders. Selecting them today changes nothing. Giving them distinct values is **code/design** work on
`LIGHTING_PRESETS`, governed, not CMS — see §4.)*

## 3. CMS responsibility boundary (reconfirmed)
Three distinct layers — CMS never crosses into the other two:

| Layer | Owns | Examples |
|---|---|---|
| **CMS presentation configuration** | *which* named profile is active, and on/off | `enabled`, `profile` |
| **Experience composition** | *where/whether* a light lives + choreography | position, offset, layering, placement, timing, driver attachment |
| **Engine behaviour** | *how* light renders + resolves | renderer, preset resolution, driver resolution, capability governor |

**CMS MAY configure (presentation only):** the profile (which bundles color · intensity · radius · falloff ·
blend), and enabled.
**CMS MUST NOT control:** position · offset · layering · timing · choreography · drivers · driver priority ·
Movement Budget · Breath Budget · cursor behaviour · scroll behaviour · the accessibility/capability governor
· experience ownership · engine behaviour · arbitrary CSS · arbitrary CSS custom properties.

## 4. Profile vs individual-value precedence — **mandatory decision**
| Model | Requires | Verdict |
|---|---|---|
| **A. Profile only** — CMS picks a named profile; receives the complete preset. | **Nothing new** — the frozen `LightingConfig` is already `{enabled, profile}`. | ✅ **CANONICAL / RECOMMENDED.** |
| **B. Profile + bounded presentation overrides** — CMS picks a profile and may override an allowlisted subset. | **Engine evolution (v1.2)** — new fields on `LightingConfig` + a bounded merge in `resolveLightingConfig`. | ⛔ Not for 3.5. Deferred; only if a real consumer proves per-value need. |
| **C. Direct preset editing** — CMS supplies all values. | Free-form lighting config. | ⛔ **Rejected outright** (unbounded; violates every contract). |

**Recommendation: Model A (Profile only).** It is exactly what the frozen engine already encodes (*"CMS
chooses a profile; it never sets five values"*), needs **no engine change and no new public API**, and makes
arbitrary-value injection **structurally impossible** (CMS supplies an enum, never a CSS value). Profile
*definitions* (`LIGHTING_PRESETS`) remain **code/design-owned**; CMS only *selects* among them.

**Precedence (Model A) — which layer wins, per concern:**
```
Source × Preset(profile ← CMS selects)      base presentation
    → Experience composition                 position / offset / layering (CMS cannot touch)
    → Scroll driver (intensity, bounded)     +dIntensity ≤ Breath Budget
    → Cursor driver (position, bounded)      +dx,dy ≤ Movement Budget
    → global clamp                           composite bound
    → ⛔ Accessibility / Capability governor  FINAL — overrides everything, CMS included
```
There is **no "CMS override" layer** under Model A — CMS only chooses the base preset bundle. (If Model B were
ever adopted, its bounded overrides would slot as `profile → CMS override → …`, but that is out of scope.)

## 5. Hard CMS validation boundaries
Under **Model A**, CMS supplies only two values — so the validation surface is tiny and safe:

| Value | Type | Allowed | Default | Invalid → | null / missing |
|---|---|---|---|---|---|
| `profile` | enum | one of `disabled·subtle·premium·campaign·seasonal` | `disabled` | reject → fall back to `disabled` | inherit default (`disabled`) |
| `enabled` | boolean | `true`/`false` | `false` | reject → `false` | inherit default (`false`) |

**The five preset fields are NOT CMS inputs under Model A** — they are code-defined per profile, so there is
nothing for CMS to inject. For completeness, *if* Model B were ever adopted, each field would need a hard
bound (recorded here as the **standing requirement**, not a 3.5 deliverable):

- **Color** — must be an approved design token from an **explicit allowlist** (e.g. `--lux-color-amber`).
  Never raw CSS, never arbitrary `var()`.
- **Blend** — **allowlist** = `normal · screen · soft-light` (the frozen `BlendMode`).
- **Intensity** — numeric, clamped to a Focal-Point-Rule cap (e.g. `0 ≤ x ≤ 0.2`); never trusted raw.
- **Radius** — from a **bounded, responsive-safe** set (`clamp()` presets), not a free string.
- **Falloff** — bounded percentage within an allowed range.

The engine must **never trust arbitrary CMS input**; unknown/out-of-range values fall back to the profile
default. Under the recommended Model A this is automatic — an invalid `profile` enum simply resolves to
`disabled`.

## 6. Public API audit
The existing surface — `resolveLightingConfig()`, `resolveLightingProfile()`, `LightingProfile`,
`LightingPreset`, `AmbientLight` — is **sufficient for Model A**. CMS supplies a `Partial<LightingConfig>`
(`{enabled, profile}`) to `resolveLightingConfig`, which the engine already accepts.

> **No new lighting public API is required.**

*(Model B would require a new bounded-override merge — a governed engine evolution — which is exactly why
Model B is deferred, not chosen.)*

## 7. Database / CMS schema boundary (architecture only)
If/when implemented, CMS should store the **minimum**, per configurable placement:

| Field | Why it exists |
|---|---|
| `placement_key` | which persistent light this config targets (created by 3.6) — **not** a position, just an identity. |
| `enabled` | on/off (boolean). |
| `profile` | one enum value (`disabled·subtle·premium·campaign·seasonal`). |
| `status` / `version` *(optional)* | draft/published + optimistic concurrency, matching existing CMS patterns. |

**Do NOT store:** a generic "lighting JSON blob", choreography, drivers, arbitrary CSS, arbitrary tokens,
timing, animation definitions, or experience-specific logic. The schema is a **small enum + boolean keyed by a
placement identity** — nothing that can encode behaviour.

## 8. Experience ownership (confirmed correct)
```
Experience
   ↓ chooses placement (position · offset · layering · timing · driver attachment)
resolveLightingConfig(CMS presentation config = { enabled, profile })
   ↓
LightingPreset
   ↓
<AmbientLight>
```
The **CMS never decides where a light lives.** The Experience owns position, offset, layering, composition,
placement, timing/choreography, and whether a capability (Cursor/Scroll) is attached. CMS supplies only the
presentation config that the Experience feeds into `resolveLightingConfig`. ✅ This model is correct and
unchanged from the frozen engine's design.

## 9. Capability / accessibility precedence
**The accessibility/capability governor is the final authority — CMS can never override it.**
- `reduced-motion` → static/dim behaviour regardless of the CMS profile.
- `off` capability tier → **no light**, even if CMS set `enabled: true` and `profile: premium`.
- A CMS-selected intensity (via profile) can **never** exceed or bypass what the governor allows.

Final precedence: `CMS profile (base) → experience composition → drivers (bounded) → global clamp → ⛔
accessibility/capability (wins over all)`.

## 10. Coexistence with existing capabilities
| Capability | Role | CMS interaction |
|---|---|---|
| Static light | base preset | CMS **selects** the profile that defines it. |
| Cursor Bend | position delta (bounded) | untouched by CMS; CMS is not a driver. |
| Scroll Breathe | intensity delta (bounded) | untouched by CMS; CMS is not a driver. |

**CMS is not a driver.** It sets the *base* presentation (which preset); the drivers then apply their bounded
deltas on top (Scroll→intensity, Cursor→position), the source remains the source, and the experience remains
the owner of composition. **Cursor Bend and Scroll Breathe are not modified.**

## 11. Signature Intro protection
- The Phase 3.2 Match Strike Intro **remains frozen.** It composes `resolveLightingConfig({ enabled: true,
  profile: "premium" })` with **hard-coded** arguments — it is **not** a CMS consumer and must not become one.
- CMS Profiles must **not** silently make the intro CMS-configurable. The CMS schema is keyed by explicit
  placement identities (§7); the intro is not among them.
- Any future change to intro lighting requires **its own governed architecture review and re-freeze** (intro
  Freeze Note).

## 12. Platform Extension Rule
CMS requirements are satisfied through the **existing internal config seam** (`resolveLightingConfig` +
`LightingProfile`) — a reusable capability that already serves every future placement. **No public API is
added.** Per the Extension Rule, the CMS wiring stays **internal** until multiple production experiences
require a common public contract. Adding an API now "because CMS might need it" is explicitly avoided.

## 13. Security / integrity boundary (architecture only)
Under Model A, **CMS values are data, not code**: a profile enum and a boolean. It is therefore impossible for
CMS to become arbitrary CSS, arbitrary custom properties, executable behaviour, driver definitions, animation
definitions, or DOM/layout instructions — CMS never supplies a CSS *value*, only *selects a code-defined
preset*. Invalid input resolves to `disabled`. The engine trusts an enum membership check, nothing more.

## 14. Recommendation — should Phase 3.5 be implemented?
### ➡ **C — DEFINE CMS ARCHITECTURE NOW, DEFER IMPLEMENTATION UNTIL A REAL CONSUMER EXISTS**

This review **is** the "define CMS architecture now" step; implementation waits for a real consumer, which
**Phase 3.6 (First Persistent Ambient Lighting Placement)** creates. In practice this entails the §1-B
sequencing — *3.6 before CMS implementation* — because there is nothing to configure until a persistent,
CMS-eligible light is placed.

- **Not A (implement now):** there is no production consumer; the intro is excluded. Building a CMS panel now
  would configure nothing.
- **Not D (platform evolution):** the existing engine + public API are **sufficient** for Model A. No frozen
  engine or API is inadequate.

This recommendation is the same conclusion whether framed as *"CMS architecture now, implementation
deferred"* or *"placement first, then implement CMS against the real consumer"* — both converge on: **define
now, implement after 3.6.** The implementation must be shaped by what the first persistent light actually
needs, not by speculation.

**Concrete gate for CMS implementation later:** (1) Phase 3.6 places a persistent, CMS-eligible light and
freezes it; (2) `campaign`/`seasonal` presets are given real, design-approved values (code, governed); (3)
CMS stores only `{placement_key, enabled, profile}` (Model A). Only then does CMS implementation begin — under
its own commit discipline.

## 15. Contract Verification (closing gate)
| Contract | Status |
|---|---|
| Platform Stability Rule | ✅ no frozen engine modified (Model A uses the existing seam). |
| Platform Extension Rule | ✅ no new public API; CMS wiring stays internal. |
| Platform Composition Checklist | ✅ passed (opening gate). |
| Composition Layer Contract | ✅ unaffected. |
| **CMS Responsibility Contract** | ✅ preserved — CMS = presentation values only (a profile selection); never choreography/drivers/timing/engine/ownership. |
| Lighting Design Contract | ✅ Focal-Point cap preserved; profiles are subtle by construction. |
| Light Source Ownership | ✅ `isAvailable()` remains sole existence authority; CMS is not a source. |
| Driver Resolution | ✅ unchanged; CMS is not a driver. |
| Renderer Purity | ✅ renderer still consumes resolved preset + source only. |
| Experience Ownership | ✅ experience owns placement; CMS supplies config only. |
| Public API Stability | ✅ `lighting/index.ts` unchanged. |
| Decorative Necessity · Interaction Dominance | ✅ gates intact. |
| Movement Budget · Scroll Idle Rule | ✅ untouched (CMS is not a driver). |
| Canonical Experience Rule | ✅ intro remains frozen; not reopened. |
| ADR-0007 / 0008 / 0009 | ✅ preserved. |
| **Phases 3.0–3.4 frozen** | ✅ not reopened by this review. |

**No missing contract discovered.** The CMS Responsibility Contract + the frozen profile model fully cover the
CMS boundary; no new governance is required.

---

## Summary
- **Model A (Profile only)** is canonical — it matches the frozen engine, needs **no engine change and no new
  public API**, and makes arbitrary-value injection structurally impossible.
- **There is no CMS consumer today**; the intro is excluded. **CMS implementation is not yet justified.**
- **Recommendation: C** — the architecture is defined here; **implementation defers until Phase 3.6 places the
  first persistent, CMS-eligible light.** Do not begin CMS implementation, migrations, UI, or schema now.
