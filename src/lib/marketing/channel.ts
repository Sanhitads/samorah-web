/**
 * Acquisition-channel normalisation. Raw UTMs are messy ("ig", "instagram.com",
 * "IG_story") — this collapses them into the handful of channels a founder actually
 * reasons about (Instagram / Google / Email / Referral / Organic / Direct), so
 * reports and CRM speak one vocabulary. Pure + deterministic — safe to derive at
 * read time anywhere.
 */
export type Channel = "Instagram" | "Google" | "Email" | "Referral" | "Organic" | "Direct" | "Other";

export function channelOf(utmSource?: string | null, utmMedium?: string | null): Channel {
  const s = (utmSource ?? "").toLowerCase();
  const m = (utmMedium ?? "").toLowerCase();
  if (!s && !m) return "Direct";
  if (/insta|\big\b|ig_|facebook|\bfb\b|meta/.test(s) || m === "social" || m === "paid_social") return "Instagram";
  if (/google|adwords|gads|youtube|\byt\b/.test(s) || m === "cpc" || m === "ppc" || m === "paid_search") return "Google";
  if (/email|newsletter|klaviyo|mailchimp|resend/.test(s) || m === "email") return "Email";
  if (m === "referral" || /referr?al|partner|affiliate/.test(s)) return "Referral";
  if (m === "organic" || s === "organic" || /seo/.test(s)) return "Organic";
  return "Other";
}
