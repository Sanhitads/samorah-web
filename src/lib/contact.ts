import { z } from "zod";
export { fieldErrors } from "@/lib/checkout"; // reuse the exact zod → field-errors helper

/** Max message length (also surfaced by the form's live character counter). */
export const CONTACT_MESSAGE_MAX = 2000;

/** Contact-form schema — used CLIENT-side (inline validation) and SERVER-side (the API safeParse),
 *  matching the checkout zod pattern. Optional fields accept "" so an empty input never blocks. */
export const contactSchema = z.object({
  firstName: z.string().trim().min(2, "Please enter your first name").max(80),
  lastName: z.string().trim().max(80).optional().or(z.literal("")),
  email: z.string().trim().email("Enter a valid email"),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number").optional().or(z.literal("")),
  subject: z.string().trim().min(2, "Please add a subject").max(160),
  orderNumber: z.string().trim().max(40).optional().or(z.literal("")),
  message: z.string().trim().min(10, "Please write a little more").max(CONTACT_MESSAGE_MAX, `Please keep it under ${CONTACT_MESSAGE_MAX} characters`),
  consent: z.boolean().refine((v) => v === true, { message: "Please agree so we can respond to you" }),
});
export type ContactForm = z.infer<typeof contactSchema>;

/** CMS-editable Contact-form configuration (stored on the cms_pages row's form_config JSONB). */
export interface ContactFormConfig {
  enableOrderNumber?: boolean;
  enablePhone?: boolean;
  successMessage?: string;
  errorMessage?: string;
  consentLabel?: string;
}
export const CONTACT_FORM_DEFAULTS: Required<ContactFormConfig> = {
  enableOrderNumber: true,
  enablePhone: true,
  successMessage: "Thank you for reaching out.\nWe've received your message and typically reply within 1–2 business days.",
  errorMessage: "We couldn't send your message right now.\nPlease try again shortly.",
  consentLabel: "I agree that Samorah may use my information to respond to this enquiry.",
};
/** Merge stored config over the defaults so a partial/absent config always yields a full object.
 *  Empty/whitespace strings are treated as "unset" → the default copy is used (so clearing a field
 *  in the editor restores the original wording on the page). Toggles default to ON unless explicitly false. */
export function resolveFormConfig(c?: ContactFormConfig | null): Required<ContactFormConfig> {
  const pick = (v: string | undefined, d: string) => (v && v.trim() ? v : d);
  return {
    enableOrderNumber: c?.enableOrderNumber !== false,
    enablePhone: c?.enablePhone !== false,
    successMessage: pick(c?.successMessage, CONTACT_FORM_DEFAULTS.successMessage),
    errorMessage: pick(c?.errorMessage, CONTACT_FORM_DEFAULTS.errorMessage),
    consentLabel: pick(c?.consentLabel, CONTACT_FORM_DEFAULTS.consentLabel),
  };
}
