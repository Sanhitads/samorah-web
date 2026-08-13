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
| `experience` | Active experience (`"intro"`). |
| `replayAfterDays` | Replay after N days; `null` = once ever. |
| `version` | Bump to re-show on a major launch. |
| `brandMark` | Reveal target: `{ kind: "text" | "svg" | "animatedSvg" | "video", text }`. |
| `failsafeMs` | Hard cap before force-dismiss. |

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

- [ ] No functional regressions — all existing features operational.
- [ ] No Lighthouse degradation beyond the agreed threshold.
- [ ] **CLS remains 0** (fixed overlay, out of flow).
- [ ] **LCP effectively unchanged** (homepage hero paints beneath; overlay is not an LCP candidate).
- [ ] **Zero hydration warnings**, zero console errors.
- [ ] No new accessibility violations.
- [ ] All existing automated tests pass.
- [ ] Performance budget met: **JS ≤ 10 KB gz · CSS ≤ 5 KB · scripting ≤ ~2 ms · no retained memory after unmount.**
- [ ] Removable by reverting the mount commit.

---

## Rollback (< 5 min)

1. **Env:** set `NEXT_PUBLIC_ENABLE_LUXURY_EXPERIENCE=false` → redeploy (feature off, code intact).
2. **Config:** set `enabled: false` in `config.ts` → deploy.
3. **Full:** `git revert <mount commit>` (feature off, engine dormant), or delete
   `src/features/luxury-experience/` **and** revert the 2 lines in `src/app/(store)/page.tsx`.

Zero DB/API/dependency footprint, so any of these is a redeploy away.
