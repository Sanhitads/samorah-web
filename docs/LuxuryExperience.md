# Luxury Experience Engine — Phase 1

An isolated, removable client-side **presentation layer** for premium first-impression motion. Phase 1
ships one experience: the **homepage intro** (match-strike → candle-light reveal). The engine is the
foundation for future experiences (page transitions, ambient lighting, flame physics, particles, hover,
seasonal) — the intro is experience #1, not the architecture.

It changes **no** business logic, API, database, routing, or existing component behaviour.

---

## Architecture

```
src/features/luxury-experience/
  index.ts                       public surface
  LuxuryExperience.tsx           the single mounted component (orchestrator)
  engine/
    config.ts                    ExperienceConfig + resolveExperienceConfig()  ← env kill switch + CMS seam
    motion.tokens.ts / .css      Motion Design System (durations · easing · opacity · warm-light palette)
    layers.css                   z-index scale (--lux-z-experience: 9000, above the app max of 1200)
    capability.ts                motion-tier detection (full | reduced | off)
    reporting.ts                 analytics seam (no-op) + event constants
    sound.ts                     disabled no-op SoundEngine seam
    ExperienceBoundary.tsx       error boundary → unmount on failure
  experiences/intro/
    IntroExperience.tsx          overlay markup (CSS-driven)
    intro.css                    the cinematic keyframes
    useIntroGate.ts              first-visit localStorage gate
```

**Integration point:** mounted once as the first child of the homepage `<main>` in
`src/app/(store)/page.tsx` (2 lines). Chosen over the layout (global blast radius) and the Hero
component (couples to CMS content) — the homepage sibling is the most scoped, content-independent point.

---

## Lifecycle

```
render (deterministic: server === first client → no hydration mismatch)
  → pre-paint inline script sets html[data-lux-skip] (returning) or html[data-lux-tier="reduced"]  (no flash)
  → useEffect (client): gate → detect tier → play (CSS timeline) → report → dismiss timer
  → dismiss (timer complete | Esc | click | failsafe) → unmount
  → cleanup (timers, listeners, html attributes)
```

- **Overlay, not loader.** The homepage SSRs and hydrates normally and loads its images/fonts/data
  **behind** the overlay; the overlay only sits on top and fades out.
- **No flash + no mismatch.** React renders the overlay identically on server and first client render;
  a tiny synchronous pre-paint script hides it for returning / reduced-motion / low-power visitors
  before paint. All environment reads (localStorage, matchMedia) happen in `useEffect`.

---

## Configuration (`engine/config.ts`)

| Field | Meaning |
|---|---|
| `enabled` | Master on/off (in-code; later CMS-driven). |
| `experienceId` | CMS instance identifier (maps to a future settings row's key). Static today (`"default"`). |
| `experience` | Which built-in experience runs (`"intro"`). |
| `version` | Number; bump to re-show on a major launch (compared to the stored last-seen version). |
| `replayPolicy` | `"once"` · `"version"` · `"version_or_days"` (**launch default**). See below. |
| `replayAfterDays` | Day count used **only** by `"version_or_days"`. Default `30`. |
| `duration` | Full-tier animation duration (ms) — CMS seam for timing; matches the CSS token today. |
| `brandMark` | Reveal target: `{ kind: "text" | "svg" | "animatedSvg" | "video", text }`. |
| `failsafeMs` | Hard cap before force-dismiss. |

This shape maps one-to-one onto a future CMS/settings row — the admin screen supplies the values
instead of this file, and the engine needs no change.

### Replay policy (Phase 1.1)

A returning visitor's record is stored in `localStorage` as `{ v: lastSeenVersion, t: lastSeenAt }`
under `samorah:lux-intro`. The decision is a pure function (`shouldReplay`) driven by the policy:

| Policy | Replays when |
|---|---|
| `"once"` | never after the first view (a version bump does **not** bring it back). |
| `"version"` | the `version` changes — a deliberate re-launch. The original once-per-version behaviour. |
| `"version_or_days"` *(launch default)* | the `version` changes **or** `replayAfterDays` (30) have elapsed since the last view. |

**Launch policy (`version_or_days`, 30 days)** — the premium, non-intrusive lifecycle:
first visit → show · returns next week → skip · returns after a month → show again ·
new campaign (version bump) → show immediately.

Both the client gate and the pre-paint inline script derive from the **same** `resolveReplayRule()`
(`{ versionKey, replayOnVersion, replayDays }`), so they cannot drift — no flash, no wrong replay.
Legacy string versions compare equal to the numeric version, so existing visitors are not re-shown on
upgrade. Admin UI is a later phase — this is the config seam only; a future "Replay Mode" screen
(First Visit · Every N Days · On New Version) maps directly onto these fields.

**Two off-switches:**
1. **Env kill switch** — `NEXT_PUBLIC_ENABLE_LUXURY_EXPERIENCE=false` (build-time; redeploy to apply) —
   usable before CMS control exists.
2. **`enabled` flag** in `config.ts` (later CMS-driven).

`resolveExperienceConfig()` is the single seam; a future CMS/DB layer merges over the defaults here
(enable/disable · duration · seasonal variant · replay) with **no engine change**.

---

## Motion Design System (`engine/motion.tokens.*`)

The shared timing/easing/opacity/colour tokens — reused by all future luxury motion, not intro-only.
The JS timeline mirrors the CSS so animation and the failsafe never diverge.

**Storyboard (2600 ms total):** dark `0–300` · spark `300–450` · strike `450–800` · flame `800–1400` ·
light-spread `1400–2000` · wordmark `2000–2400` · fade `2400–2600`. Reduced/low-power: wordmark fade
`0–200`, overlay fade `200–400`.

---

## Accessibility

- `prefers-reduced-motion` → the graceful ~400 ms fade (no transforms), not a blank skip.
- Low-power devices (`hardwareConcurrency ≤ 2` / `deviceMemory ≤ 1`) → same reduced tier.
- Overlay is `aria-hidden`, does not steal/trap focus; **Esc / click** skip; homepage focus order stays valid.
- No audio; never autoplays.

---

## Extension points (Phase 2+)

- **brandMark** — swap text → SVG → animated SVG → video via config.
- **reporting** — wire `EXPERIENCE_EVENTS` (viewed/skipped/completed) to the existing analytics.
- **capability** — add runtime FPS-based downgrade on top of the pre-emptive tiering.
- **sound** — enable a subtle match-strike cue (user-gated) via config + a real `SoundEngine`.
- **config** — CMS control + seasonal variants (Diwali, Christmas, launches).
- **engine** — new experiences (page transitions, ambient lighting, flame physics, particles, hover)
  reuse tokens, layering, config, reporting, capability, boundary, and sound.

---

## Phase 1 Success Criteria (definition of done)

Verified in this environment (build + SSR + source):

- [x] **No functional regressions** — analytics wiring (`SectionTracker`/`JsonLd`/`ComposedSections`) untouched by the mount diff; every non-home route renders zero overlay.
- [x] **CLS 0 by construction** — overlay is `position:fixed`, out of flow.
- [x] **Removable by reverting the mount** — `git revert d248ec5` verified: overlay gone, engine files intact, build passes.
- [x] **Kill switch verified** — `NEXT_PUBLIC_ENABLE_LUXURY_EXPERIENCE=false` build → overlay + gate script fully absent, homepage intact.
- [x] **Deterministic render** — server === first client render (no window/localStorage reads during render) → no hydration mismatch by construction.
- [x] **Reduced-motion correct at source** — `[data-lux-tier="reduced"]` **and** `@media (prefers-reduced-motion)` both drop flame/spark/glow → 400 ms no-transform fade.
- [x] **Production build clean** — `next build` exit 0; overlay present on first-visit SSR; isolation confirmed.

Requires a human at a real browser before freeze (cannot be produced headlessly here):

- [ ] Zero **runtime console errors / React hydration warnings** (browser DevTools).
- [ ] **Lighthouse** before/after — Performance · A11y · Best Practices · SEO effectively unchanged. *(lighthouse CLI not installed locally.)*
- [ ] **First / return / incognito** visual pass (plays once · no flash · no blank · reload skips cleanly).
- [ ] **Mobile** — iOS Safari + Android Chrome: smooth, no viewport jump, no white flash.
- [ ] No failed asset requests / CSP warnings in the Network tab.

---

## Known Limitations (Phase 1)

- **Analytics experience events are intentionally not wired.** `reporting.ts` is a no-op seam; viewed/skipped/completed are not sent to GA4/GTM/Clarity yet.
- **CMS control is scaffolded, not connected.** `resolveExperienceConfig()` is the merge seam, but config is in-code today (env kill switch + `enabled` flag); no DB/admin toggle.
- **Runtime FPS adaptation is architected, not implemented.** Tiering is pre-emptive (reduced-motion / core / memory heuristics); there is no live frame-rate downgrade mid-animation.
- **Sound engine is a disabled placeholder.** `silentSound` is a no-op; no audio is loaded or played.
- **Brand mark is the text wordmark.** `brandMark.kind` supports `svg`/`animatedSvg`/`video` in the type, but only `text` ("SAMORAH") is rendered in Phase 1.
- **One experience only.** `intro` is the sole experience; page transitions, ambient lighting, flame physics, particles, hover, and seasonal variants are future phases.

None of these block launch — each is a deliberate Phase-1 boundary, not an unfinished feature.

---

## Production readiness

**Status: Production Ready** for everything verifiable without a browser (build, SSR, isolation, kill switch, rollback, analytics isolation, deterministic render, reduced-motion source). The five browser-only checks above are the remaining sign-off gate — the design satisfies them by construction, but they should be eyeballed once on real devices before freeze.

---

## Rollback (< 5 min)

1. **Env:** set `NEXT_PUBLIC_ENABLE_LUXURY_EXPERIENCE=false` → redeploy (feature off, code intact).
2. **Config:** set `enabled: false` in `config.ts` → deploy.
3. **Full:** `git revert <mount commit>` (feature off, engine dormant), or delete
   `src/features/luxury-experience/` **and** revert the 2 lines in `src/app/(store)/page.tsx`.

Zero DB/API/dependency footprint, so any of these is a redeploy away.

---

## QA Sign-Off Checklist (freeze gate)

The technical verification above is automated (build · SSR · source). This is the **human sign-off** —
run it on a real preview deploy and tick every box. Phase 1 is formally frozen only when all are checked.

**Sign-off:** name ______________  · date ____________  · build/commit ____________

### Feature behaviour
- [ ] First visit plays the intro **exactly once**.
- [ ] Returning visit (reload) **skips** the experience — no flicker, no overlay flash.
- [ ] Fresh incognito session plays the intro again.
- [ ] Reduced-motion mode shows the simplified ~400 ms fade (no flame/spark/glow).
- [ ] Kill switch (`NEXT_PUBLIC_ENABLE_LUXURY_EXPERIENCE=false`) fully disables the feature.
- [ ] Homepage is **interactive immediately** after the overlay dismisses (scroll, nav, clicks).
- [ ] Esc key and click both dismiss the overlay early.
- [ ] Overlay always self-dismisses (never sticks past the failsafe).

### Console & performance
- [ ] No console errors.
- [ ] No React hydration warnings.
- [ ] No failed asset requests (Network tab).
- [ ] No CSP warnings (if applicable).
- [ ] No Lighthouse regression beyond agreed thresholds (Performance · Accessibility · Best Practices · SEO).
- [ ] CLS remains 0; LCP effectively unchanged.

### Browser & device matrix
- [ ] Chrome (desktop) verified.
- [ ] Safari (desktop) verified.
- [ ] Firefox (desktop) verified.
- [ ] Edge (desktop) verified.
- [ ] Android Chrome verified — smooth, no viewport jump, no white flash.
- [ ] iOS Safari verified — smooth, no viewport jump, no white flash.

### Regression — existing surfaces unaffected
- [ ] Product pages unaffected (no overlay, no layout shift).
- [ ] Cart unaffected.
- [ ] Checkout unaffected.
- [ ] Authentication / account unaffected.
- [ ] Admin unaffected.
- [ ] Every non-home route renders **zero** overlay.

### Analytics
- [ ] Normal page views still fire (GA4 / GTM / Clarity).
- [ ] No duplicate page views.
- [ ] No duplicate session starts.
- [ ] Existing analytics behaviour unchanged (experience events remain intentionally dormant — see Known Limitations).

**Once every box is checked, Phase 1 can be formally frozen.**
