# ADR 0007 — Homepage Flame prototype rejected

**Status:** Accepted (Luxury Flame Primitive · Phase 2.1 decision)

## Context

Phase 1 shipped the cinematic **Match Strike Intro** — the signature emotional moment of the Samorah
experience. Phase 2 built the **Luxury Flame Primitive**, a reusable, production-ready SVG+CSS flame.
The obvious next question was whether the primitive should also live permanently on the homepage hero.

Rather than assume, we **prototyped** it: a dormant-by-default hero integration with an on-screen chooser
to compare all three placements (above eyebrow / beside heading / near scroll cue) across desktop, mobile,
light, dark, and hero photography — with zero production impact. The prototype was then reviewed from both
an engineering and a brand perspective.

## Decision

**The homepage flame is rejected.** The homepage will not carry a permanent, continuously-visible flame.

This is a deliberate brand decision, not a technical one:
- A continuously visible homepage flame **reduces the exclusivity of the cinematic intro** and makes the
  signature moment feel ordinary.
- The homepage is **intentionally typography-led**; the flame competed with the headline (luxury lets
  typography win).
- The **Flame Primitive is reserved for narrative/emotional experiences**, not ambient decoration.

The prototype was removed entirely with zero production impact — `Hero.tsx` restored to its frozen state,
no dormant code or switches left. The Flame Primitive itself remains a frozen platform component.

## Consequences

- **Future homepage work must not reintroduce a permanent flame unless this ADR is explicitly superseded.**
- The primitive is reserved for moments with genuine narrative weight — the **intro retrofit** (Phase 2.1
  Signature Flame Integration), campaigns, and product storytelling.
- This decision is governed by two permanent rules in the Luxury Design System (see
  [FLAME_PRIMITIVE.md](../roadmaps/FLAME_PRIMITIVE.md)): the **Brand Exclusivity Principle** and the
  **Prove-in-Isolation Principle** (a component proves itself in isolation before joining a signature
  experience — exactly the primitive → prototype → reject → no-production-impact path that produced this ADR).
