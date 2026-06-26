/**
 * Homepage §8 — The Letters / Letters from the Studio (internal name).
 *
 * NOT an email-capture form and NOT "Newsletter / Subscribe / Join". It is the
 * quietest editorial moment before the footer — the final page of a printed
 * journal. Luxury brands invite, they don't ask. The invitation comes first;
 * the form comes last:
 *
 *   one large editorial invitation
 *     → one restrained explanatory sentence
 *       → an underline-only field
 *         → an editorial text-link ("Become a Reader")
 *           → a tiny promise ("one or two letters each month")
 *
 * CAMPAIGN / SEASONAL: the whole section changes by data, never by code — a
 * Christmas, Valentine's or Monsoon letter is just another active variant
 * (Default Copy vs Festival Copy). The CMS owns it entirely.
 *
 * FUTURE — this is not only a newsletter; it becomes the CRM hub (seasonal
 * launches · limited editions · pre-orders · workshop invites · collaborations ·
 * journal · gift guides · private launches · early access · founder letters …).
 * The subscription BACKEND — table · double opt-in · Resend · segmentation ·
 * analytics · unsubscribe — is deferred to the Email phase (Phase 14); only the
 * UI is built now. (See PROJECT_CONTEXT.)
 */
export interface LettersInvitation {
  id: string;
  /** The large editorial invitation — the focal sentence. */
  invitation: string;
  /** One restrained explanatory sentence beneath it. */
  supportingCopy: string;
  /** Underline-only field placeholder, e.g. "your@email.com". */
  placeholder: string;
  /** Editorial CTA — "Become a Reader" / "Receive the Letters" — never "Join". */
  ctaLabel: string;
  /** Tiny expectation line beneath the field. */
  promise: string;
  /** Quiet inline confirmation that replaces the form on success (fade only). */
  successMessage: string;

  // — campaign / seasonal (Default Copy vs Festival Copy) —
  campaignId?: string;
  season?: string;
  /** Section surface; stays warm-ivory by default. */
  backgroundTone?: string;

  // — CMS control —
  isActive: boolean;
  priority?: number;
  startDate?: string | null;
  endDate?: string | null;
  displayOrder: number;
  visibility: boolean;
}

/**
 * Local invitations. The default (no campaign, always active) is the evergreen
 * letter; seasonal variants wait, inactive, until marketing activates them — at
 * which point the section changes with no code edit.
 */
export const LETTERS_INVITATIONS: LettersInvitation[] = [
  {
    id: "default",
    invitation: "Some stories arrive only once.",
    supportingCopy:
      "Receive occasional letters from the studio — new chapters, seasonal atmospheres, and quiet moments worth keeping.",
    placeholder: "your@email.com",
    ctaLabel: "Receive the Letters",
    promise: "No more than one or two letters each month.",
    successMessage: "Thank you. The next chapter will find you soon.",
    backgroundTone: "warm-ivory",
    isActive: true,
    displayOrder: 1,
    visibility: true,
  },
  {
    id: "christmas",
    invitation: "Receive the Christmas Letter.",
    supportingCopy:
      "A single letter before the season — the winter chapter, and the rooms it was made for.",
    placeholder: "your@email.com",
    ctaLabel: "Receive the Letter",
    promise: "One letter, sent before Christmas.",
    successMessage:
      "You're on the list. The Christmas Letter will find you soon.",
    campaignId: "winter-edition",
    season: "christmas",
    backgroundTone: "warm-ivory",
    isActive: false, // marketing activates for the winter campaign
    priority: 1,
    displayOrder: 2,
    visibility: true,
  },
  {
    id: "monsoon",
    invitation: "When the rains arrive, so will the next story.",
    supportingCopy:
      "Letters from the studio for the monsoon — slower chapters, written for grey afternoons.",
    placeholder: "your@email.com",
    ctaLabel: "Receive the Letters",
    promise: "One or two letters through the season.",
    successMessage:
      "You're on the list. The next letter will arrive with the rains.",
    campaignId: "monsoon-edition",
    season: "monsoon",
    backgroundTone: "warm-ivory",
    isActive: false,
    priority: 1,
    displayOrder: 3,
    visibility: true,
  },
];

function withinWindow(l: LettersInvitation, now: Date): boolean {
  if (l.startDate && now < new Date(l.startDate)) return false;
  if (l.endDate && now > new Date(l.endDate)) return false;
  return true;
}

/**
 * The active letter for the homepage. Prefer a variant tied to the active
 * campaign (and inside its date window); otherwise fall back to the evergreen
 * default — so the section stays relevant whatever the campaign. (Date windows
 * become live when the homepage is ISR/dynamic; one open-ended default today
 * keeps it static.)
 */
export function getLettersInvitation(
  campaignId?: string,
  now: Date = new Date(),
): LettersInvitation | null {
  const pool = LETTERS_INVITATIONS.filter(
    (l) => l.visibility && l.isActive && withinWindow(l, now),
  ).sort(
    (a, b) =>
      (a.priority ?? Number.MAX_SAFE_INTEGER) -
        (b.priority ?? Number.MAX_SAFE_INTEGER) || a.displayOrder - b.displayOrder,
  );

  if (campaignId) {
    const tied = pool.find((l) => l.campaignId === campaignId);
    if (tied) return tied;
  }
  return pool.find((l) => !l.campaignId) ?? pool[0] ?? null;
}
