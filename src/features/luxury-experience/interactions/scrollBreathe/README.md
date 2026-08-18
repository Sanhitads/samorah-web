# Scroll Breathe — adopted interaction driver (Phase 3.4)

The **sanctioned, permanent home** for the validated Scroll Breathe capability, promoted here from
`experiences/_validation/scrollBreathe/` after passing browser/emotional review (Phase 3.4, Commit 2).

## Status: ADOPTED · DORMANT
- **Adopted** — this is the canonical, reusable implementation (no longer validation-area code).
- **Dormant** — imported by **no** production route or experience. It introduces **no runtime behaviour** on
  its own. A future **reviewed placement phase** (see roadmap: *First Persistent Ambient Lighting Placement*)
  attaches it to a persistent light. Capability and experience-adoption stay deliberately separated.

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
