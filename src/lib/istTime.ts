/**
 * IST (Asia/Kolkata) scheduling helpers (Phase 2 · point 13). Samorah campaigns are scheduled in IST;
 * the DB stores UTC `timestamptz`. IST is a FIXED +05:30 offset (no DST), so conversions are exact and
 * deterministic — the admin types/reads IST, we persist the correct UTC instant, and server eligibility
 * always uses the stored UTC instant (never the browser timezone). Pure; identical on client + server.
 */
export const IST_TZ = "Asia/Kolkata";
const IST_OFFSET = "+05:30";

/** A UTC ISO instant → "20 Aug 2026, 11:59 PM IST" (or a custom part set). Empty string for null. */
export function formatIST(iso: string | null | undefined, opts: { dateOnly?: boolean; withZone?: boolean } = {}): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts: Intl.DateTimeFormatOptions = opts.dateOnly
    ? { day: "2-digit", month: "short", year: "numeric" }
    : { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true };
  const s = new Intl.DateTimeFormat("en-IN", { ...parts, timeZone: IST_TZ }).format(d);
  return opts.withZone === false ? s : `${s} IST`;
}

/** A `datetime-local` value the admin typed (interpreted as IST wall-clock) → UTC ISO for storage.
 *  "2026-08-20T23:59" (meant as IST) → "2026-08-20T18:29:00.000Z". Empty input → null. */
export function istLocalToUtc(local: string | null | undefined): string | null {
  if (!local) return null;
  // Append seconds if the control omitted them, then the fixed IST offset, and normalise to UTC.
  const withSecs = /\d{2}:\d{2}:\d{2}$/.test(local) ? local : `${local}:00`;
  const d = new Date(`${withSecs}${IST_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** A stored UTC ISO instant → the `datetime-local` value in IST for the input control ("2026-08-20T23:59"). */
export function utcToIstLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // Shift the instant into IST wall-clock, then read the Y-M-DTH:M off the shifted value.
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 16);
}
