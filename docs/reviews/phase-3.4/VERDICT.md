# Phase 3.4 — Scroll Breathe Validation · Review Verdict

**Completed by a human ONLY after the browser review.** (Add a new block per review session; keep prior
blocks as history.)

---

- **Review date:** ____________________
- **Reviewer:** ____________________
- **Build / commit reviewed:** `95aefa2`  (Scroll Breathe Validation harness, Commit 1)
- **Displays used:** ☐ desktop  ☐ mobile   **Themes:** ☐ dark  ☐ light   **Reduced-motion checked:** ☐

## Gates
Answer each honestly; the desired answer is in parentheses. Any **Fail** → do **not** adopt.

| Gate | Pass / Fail | Notes |
|---|---|---|
| **Emotional Parity** — with the breath present, the experience still feels like itself; the flame/content remain the focus | | |
| **Subconscious Presence** — *"Does the breath read as an animation / a visible pulse?"* (**No** = pass) | | |
| **Interaction Dominance** — *"Did you scroll just to watch the light?"* (**No** = pass) | | |
| **Decorative Necessity** — *"If the breath vanished, would you immediately notice?"* (**No** = pass) | | |
| **Light Dominance** — *"Did you notice the light before the content while scrolling?"* (**No** = pass) | | |
| **Scroll Naturalness** — scrolling feels natural; the light never lags oddly, chases, or draws the eye; returns to full smoothly when you stop | | |

## Observed Differences
Objective observations only (so a **Tune** verdict is deterministic, not guesswork). Compare the **mid** and
**idle** captures, and the breath vs. the fully-static baseline.

None

_…or, for example:_
- • The dip is visible as a pulse at mid-scroll
- • The return to full is too slow / too fast to feel natural
- • The light appears to "pump" during fast scrolling
- • The breath is noticeable on a bright display but not a dim one

## Overall decision
☑ **Adopt** (all six gates pass)  ☐ **Tune** (presentation only — address the Observed Differences above)  ☐ **Reject**

**Rationale:** ____________________________________________

### Recorded browser observation (why the effect is intentionally this restrained)
> **Start, mid-scroll, and idle states remain visually similar under normal observation. The breathing effect
> is intentionally difficult to perceive directly and serves only as subconscious atmosphere.**

This is the *desired* result, not a defect: the near-identical mid/idle appearance is the effect working
(*absence before presence*). It is recorded to protect future work from "making it more obvious" — increasing
the Breath Budget or the gain to make the breath visible would violate the Lighting Design Contract and the
Interaction Dominance gate. No tuning was recommended.

---

## Adoption criteria (binding)
- **Commit 2 (Adopt) begins ONLY if every gate above passes.** A single Fail blocks adoption.
- If one gate fails: record the Observed Differences → perform **exactly one** targeted, presentation-only
  tuning pass (no value tuning beyond the recorded difference) → **re-review** → adopt only if all gates then
  pass. **No repeated tweaking — exactly one tuning cycle.**
- On unanimous pass, the sequence is: **Commit 2 Adopt → Commit 3 Remove harness → Commit 4 Freeze** (mirrors
  Phase 3.2 / 3.3).

_Reference screenshots: `docs/reviews/phase-3.4/*.png` (8-shot matrix — see README)._
