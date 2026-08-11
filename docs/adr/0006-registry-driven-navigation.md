# ADR 0006 — Registry-driven navigation

**Status:** Accepted (Reports Refinement · Stage R3)

## Context

Admin surfaces — Analytics (`/admin/analytics`) and Reports (`/admin/reports`) — let a founder click a KPI
or a table row and "drill" to the operational page behind the number (Revenue → the orders that made it,
Customers → the customer list, and so on). Historically each surface could have hard-coded its own `href`
strings inline. That invites three failure modes at scale: (1) the same concept drifting to different routes
on different pages, (2) drills that point at pages/filters that don't exist ("fake destinations"), and
(3) destinations that are defined once, never used, and quietly rot into dead routes. For a founder-facing
financial tool, a misleading or broken drill is a trust problem, not a cosmetic one.

## Decision

**Navigation is registry-driven.** A single source of truth — `ANALYTICS_DRILL_TARGETS` in
`src/lib/analytics/analyticsRegistry.ts` — maps a named destination to its `{ route, tooltip, isExternal }`.
No component writes an inline route string.

- **Reports and Analytics share the same drill registry.** Both consume `ANALYTICS_DRILL_TARGETS`; Reports
  does not define a parallel map. A shared concept (Revenue/Orders → `orders`, Customers → `customers`)
  therefore resolves to *one* route for *both* surfaces — they cannot diverge.
- **`resolveDrill()` is the single navigation resolver.** Every surface calls `resolveDrill(key, params)` to
  turn a target + contextual params (e.g. the current window) into a concrete `{ href, tooltip, isExternal,
  analyticsContext }`. One function owns query-merging and the shape of a drill — so KPI cards, charts, and
  table rows behave identically. `DrillTargetKey = keyof typeof ANALYTICS_DRILL_TARGETS` makes every key
  strongly typed: an unknown destination is a compile error, not a runtime 404.
- **Drill targets carry a lifecycle status** (`DRILL_TARGET_STATUS`: `active` / `reserved` / `deprecated`) —
  architectural metadata only; it is never rendered and `resolveDrill` ignores it. `active` = used by ≥1
  widget; `reserved` = intentionally defined for a future capability (with a reason); `deprecated` = kept
  temporarily for back-compat. The `Record<DrillTargetKey, …>` type forces every target to declare a status.
- **Registry completeness tests exist** so a target is never silently orphaned: every entry must be either
  referenced by a widget (Analytics or Reports) *or* explicitly `reserved` / `deprecated`. This is the
  inverse of the "no fake destinations" rule — it prevents *dead* routes from accumulating.
- **Route-parity tests exist** so Reports and Analytics cannot drift: each Reports `drillTarget` must be a key
  of the shared map and must resolve to the exact route the map defines; shared destinations (Revenue /
  Orders / Customers) must resolve identically to their Executive Summary KPI.

Intentionally non-navigable rows are documented (`REPORTS_NON_DRILLABLE`: `isDrillable: false` + `reason` +
`futureRequirement`) rather than given a misleading generic link — no fake destination is ever shipped.

## Consequences / future benefits

- **Compile-time safety.** `DrillTargetKey` and the `Record<DrillTargetKey, …>` status map turn "does this
  destination exist?" and "did we govern this new target?" into type errors caught before runtime.
- **Prevention of route drift.** One shared map + parity tests mean the same concept can never point at two
  different routes across surfaces, however the admin grows.
- **Centralized permissions.** With destinations named in one place, RBAC/feature-flag decisions about who may
  drill where (and which link-outs are external) have a single, auditable home instead of scattering across
  components.
- **Export / report integration.** A saved or exported report can record the *named* destination + params
  (`analyticsContext`) rather than a brittle URL, so a stored report remains navigable as routes evolve.
- **Future AI / report navigation.** A command palette or an assistant can resolve "take me to the orders
  behind this revenue" through the same `resolveDrill` seam — no new navigation layer, and every answer is a
  real, governed destination.

- One place to add, retire (`deprecated`), or reserve a destination; lifecycle + completeness tests keep the
  set honest over time. Presence of a target ≠ a live link; widgets opt in via `drillTarget`, and value-only
  rows stay value-only by design.
