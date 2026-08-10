# ADR 0003 — Analytics widget registry

**Status:** Accepted (Milestone 2 · Stage 1)

## Context
Milestone 2 adds many widgets across seven stages. Each needs consistent RBAC, an independent feature
flag, an owning domain/service (for reuse traceability — no duplicate services), a drill-down route,
refresh cadence, and layout metadata. Scattering these across components would make governance and a
future customisation UI impossible.

## Decision
A single manifest — `src/lib/analytics/analyticsRegistry.ts` — is the source of truth. Every widget
declares: `key`, `name`, `domain` (Business / Operations / Marketing / Finance / Customer / Inventory /
System), `component`, `featureFlag` + `defaultEnabled`, `permission`, `service`, `route`,
`refreshIntervalMs`, `dataSource`, `visibility`, `displayOrder`, `defaultSize`, `stage`. Components and
services are referenced by **string keys** so the manifest stays a pure, importable module with no React
or DB dependencies. Feature-flag resolution (`isWidgetEnabled`) and env overrides live alongside.

## Consequences
- One place to add, group (`widgetsForStage` / `widgetsForDomain`), flag, and RBAC-gate widgets.
- Enables per-widget enable/disable and a future dashboard-customisation UI without touching widgets.
- Presence in the registry ≠ rendered; widgets are wired into pages stage-by-stage.
