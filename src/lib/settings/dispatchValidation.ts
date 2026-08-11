/**
 * Dispatch-config validation (Admin Settings · Phase S2A) — pure, framework-free; used by BOTH the client
 * form and the server route (defense-in-depth), mirroring the S1B cost-validation pattern. Messages are
 * CORRECTIVE — they explain how to fix the value. Validates only the `site_settings.dispatch` fields.
 */
export type DispatchField = "cutoffTime" | "slaHours";

export interface DispatchValidationError {
  field: DispatchField;
  message: string;
}

export interface DispatchInputs {
  cutoffTime: string;
  slaHours: number;
}

/** 24-hour HH:MM, 00:00–23:59. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_SLA_HOURS = 240; // 10 days — a sane upper bound for a dispatch promise

/** One corrective error per invalid field (empty array = valid). */
export function validateDispatch(d: DispatchInputs): DispatchValidationError[] {
  const errors: DispatchValidationError[] = [];

  if (!TIME_RE.test(d.cutoffTime)) {
    errors.push({ field: "cutoffTime", message: "Cutoff time must be a 24-hour time as HH:MM — enter e.g. 14:00." });
  }
  if (!(Number.isFinite(d.slaHours) && Number.isInteger(d.slaHours) && d.slaHours >= 0 && d.slaHours <= MAX_SLA_HOURS)) {
    errors.push({ field: "slaHours", message: `Dispatch SLA must be a whole number of hours between 0 and ${MAX_SLA_HOURS} — enter e.g. 24 (for next-day).` });
  }

  return errors;
}
