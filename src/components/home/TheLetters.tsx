"use client";

import { useId, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import type { LettersInvitation } from "@/config/letters";

/**
 * Section 8 (titleless) — The Letters: the quietest editorial moment before the
 * footer, the final page of the journal. The invitation comes first, the form
 * last. One large editorial sentence → one restrained line → an underline-only
 * field → an editorial text-link → a tiny promise.
 *
 * No boxed inputs, coloured buttons, cards, icons, badges, popups or marketing
 * language. On focus, only the underline transitions from muted grey to warm
 * gold. On success the form is replaced inline by a quiet confirmation that
 * simply fades in — no modal, toast or animation beyond that.
 *
 * UI ONLY: the subscription backend (table · double opt-in · Resend ·
 * segmentation · analytics · unsubscribe) is deferred to the Email phase.
 * Accessible: real <form>, labelled field, type=email validation, keyboard
 * operable, focus state, aria-live status.
 */
const EASE_LUXURY = [0.25, 0.1, 0.25, 1] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function TheLetters({
  invitation,
}: {
  invitation: LettersInvitation | null;
}) {
  const reduce = useReducedMotion() ?? false;
  const sectionRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inView = useInView(sectionRef, { once: true, margin: "0px 0px -15% 0px" });
  const [email, setEmail] = useState("");
  const [error, setError] = useState(false);
  const [done, setDone] = useState(false);
  const fieldId = useId();

  if (!invitation) return null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL.test(email.trim())) {
      setError(true);
      inputRef.current?.focus();
      return;
    }
    setError(false);
    setDone(true); // optimistic — the invitation is quiet either way
    // Persist to the newsletter table (idempotent by email). Fire-and-forget;
    // a failure never disrupts the editorial moment. (Double opt-in + Resend later.)
    void fetch("/api/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), source: "homepage" }),
    }).then(() => {
      import("@/lib/analytics/track").then(({ track }) => track("newsletter_signup", { source: "homepage" }));
    }).catch(() => {});
  };

  return (
    <section
      ref={sectionRef}
      className="home-letters"
      data-tone={invitation.backgroundTone ?? "warm-ivory"}
      aria-label="Letters from the studio"
    >
      <motion.div
        className="home-letters__inner"
        initial={{ opacity: 0, y: reduce ? 0 : 10 }}
        animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: reduce ? 0 : 10 }}
        transition={{ duration: reduce ? 0.4 : 1, ease: EASE_LUXURY }}
      >
        {/* the recurring gold hairline — the quiet "final chapter" signature */}
        <span className="home-letters__rule" aria-hidden="true" />
        <p className="home-letters__invitation">{invitation.invitation}</p>
        <p className="home-letters__copy">{invitation.supportingCopy}</p>

        {done ? (
          <motion.p
            className="home-letters__success"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduce ? 0.3 : 0.7, ease: EASE_LUXURY }}
          >
            {invitation.successMessage}
          </motion.p>
        ) : (
          <form className="home-letters__form" onSubmit={onSubmit} noValidate>
            <label htmlFor={fieldId} className="home-letters__label">
              Email address
            </label>
            <input
              ref={inputRef}
              id={fieldId}
              type="email"
              inputMode="email"
              autoComplete="email"
              className="home-letters__input"
              placeholder={invitation.placeholder}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(false);
              }}
              aria-describedby={`${fieldId}-note`}
              aria-invalid={error || undefined}
              required
            />
            <button type="submit" className="home-letters__cta">
              {invitation.ctaLabel}
              <span className="home-letters__arrow" aria-hidden="true">→</span>
            </button>
            <p id={`${fieldId}-note`} className="home-letters__promise" aria-live="polite">
              {error
                ? "Please enter a valid email address."
                : invitation.promise}
            </p>
          </form>
        )}
      </motion.div>
    </section>
  );
}
