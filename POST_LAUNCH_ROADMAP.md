# Post-Launch Roadmap

Non-blocking enhancements deliberately deferred past launch. Nothing here gates a release; each entry
records a decision made during build so it is not silently lost.

## Email

### Unify preheader / message-envelope handling across coded-default and authored emails
**Status: non-blocking · post-launch. Not required for Phase 1 closure.**

Today the transactional email "envelope" is handled in two places by design:

- **Subject** — a published CMS override applies to *both* the coded-default email and an authored
  body (via `resolveSubject` on the canonical send path).
- **Preheader (and hero/eyebrow/heading/blocks)** — apply only when an operator authors a full body
  (rendered by `renderEmailBlocks`, which emits the hidden preheader span). The **coded-default**
  builders (`emailLayout` / `build*` in `src/lib/email/`) do **not** consume a CMS preheader.

This split is intentional. Wiring a CMS preheader into the coded-default path would mean modifying the
protected transactional fallback (`compose` / `build*`) — the exact path that guarantees an invalid or
missing customization can never stop an Order Confirmation from going out. Phase 1's scope rule was to
stop and defer rather than code around that fallback.

**Future option (only if desired):** introduce a single message-envelope abstraction (subject +
preheader + from/reply-to) that both the coded-default and authored renderers consume, so a CMS
preheader could apply to the coded default too — without duplicating a renderer or weakening the
fallback guarantee. Must preserve: coded-default emails always send even with no/invalid customization;
one renderer and one token path; no second email system.
