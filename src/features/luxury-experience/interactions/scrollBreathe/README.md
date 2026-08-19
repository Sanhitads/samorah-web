# Scroll Breathe — adopted interaction driver (Phase 3.4)

The **sanctioned, permanent home** for the validated Scroll Breathe capability, promoted here from
`experiences/_validation/scrollBreathe/` after passing browser/emotional review (Phase 3.4, Commit 2).

## Lifecycle status — FROZEN (Phase 3.4)
```
✓ Adopted            — canonical, sanctioned implementation (no longer validation-area code)
✓ Reusable           — a general interaction capability; any experience may compose it
✓ Dormant            — introduces no runtime behaviour on its own
✗ Not attached       — wired to no production experience
✗ Not routed         — reachable by no URL
✗ Not user-visible   — absent from every shipped bundle; zero runtime footprint
```
A future **reviewed placement phase** (see roadmap: *First Persistent Ambient Lighting Placement*) attaches it
to a persistent light. Capability and experience-adoption stay deliberately separated.

> **Adoption does not constitute production placement or activation. Any future attachment of Scroll Breathe
> to a production light or experience requires its own architecture review, placement decision,
> browser/emotional review, validation, and freeze.** *"Adopted" means reusable capability — NOT approved for
> a production experience treatment.* (Frozen except for defect fixes; compose from it, do not extend it in
> place.) See [SCROLL_BREATHE.md §14](../../../../../docs/roadmaps/SCROLL_BREATHE.md).

## Why this is NOT exported from the Lighting Engine public API
> **Scroll Breathe is a reusable *interaction capability*, not a platform *engine* capability. It remains
> internal until multiple production experiences require a common public contract.**

Per the **Platform Extension Rule**, a new public API is justified only when it provides reusable *platform*
capability across multiple experiences/products/campaigns — not for a single (or zero) consumer. Scroll
Breathe composes the frozen engine through its **existing** public APIs (`LightDriver`, `resolveAmbientLight`,
`AmbientLight`); it adds nothing to `lighting/index.ts`. Exporting it now would widen the engine's public
surface for a capability with no production consumer yet — precisely the platform erosion the rule prevents.
If several experiences later need it through one contract, promoting it to a public API is its own governed
evolution (new review · ADR · re-freeze).

## What it is
A bounded **intensity** modulator implementing the frozen `LightDriver` interface — the intensity-channel
sibling of Cursor Bend (position). It composes the frozen Ambient Lighting Engine **only** through public
APIs; it modifies no engine and adds no public API. Applied by an experience via an experience-owned
`--lux-*` **opacity** wrapper (compositor-safe).

| File | Role |
|---|---|
| `breathBudget.ts` | Breath Budget (instance of the permanent Movement Budget rule on intensity; cap 0.06) + `clampToBreath` |
| `scrollBreatheDriver.ts` | frozen `LightDriver` impl (`intensity` channel only, priority 10); `computeBreath` (pure) + passive, rAF-coalesced scroll signal + idle-reset (Scroll Idle Rule) |
| `*.test.ts` | Breath Budget clamp · driver conformance · scroll lifecycle / idle / flood / memory safety |

## Contracts honoured
Frozen engine untouched · no public API · bounded modulation (Breath Budget) · Driver Resolution (priority 10,
before Cursor 20) · Scroll Idle Rule (smooth return, no oscillation) · event-rate independent. See
[docs/roadmaps/SCROLL_BREATHE.md](../../../../../docs/roadmaps/SCROLL_BREATHE.md).
