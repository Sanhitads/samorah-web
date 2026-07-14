"use client";

import { setConsent } from "@/lib/analytics/consent";

/**
 * Cookie consent banner (review point 10). Analytics does not load or fire until the
 * visitor chooses. Minimal, luxury-restrained — a quiet strip, not a modal wall. No
 * data is collected on this screen; the choice is stored locally only.
 */
export function ConsentBanner() {
  return (
    <div className="consent" role="dialog" aria-label="Cookie preferences" aria-live="polite">
      <p className="consent__text">
        We use privacy-first analytics to understand how our fragrance stories are read — never your name, email, or phone.{" "}
        <a href="/privacy" className="consent__link">Privacy</a>
      </p>
      <div className="consent__actions">
        <button type="button" className="consent__btn consent__btn--ghost" onClick={() => setConsent("denied")}>Decline</button>
        <button type="button" className="consent__btn consent__btn--accept" onClick={() => setConsent("granted")}>Accept</button>
      </div>
    </div>
  );
}
