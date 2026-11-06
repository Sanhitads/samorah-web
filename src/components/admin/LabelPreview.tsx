"use client";

/**
 * Phase 10 — printable batch-label preview. Prop-driven from the authoritative generate_label payload.
 * The immutable human-readable batch code is ALWAYS shown; an optional encoded value must equal it.
 * Retail labels list missing business/legal fields explicitly (never fabricated). A non-approved / held /
 * recalled batch is clearly marked NOT FOR SALE. Print CSS keeps small formats legible with no clipping.
 */
export interface LabelPayload {
  purpose: string;
  verified: {
    batch_code: string; product_name?: string; variant?: string; sku?: string; vessel?: string;
    net_quantity?: string; hsn_code?: string; manufacturing_date?: string; lifecycle_status?: string; recall_state?: string;
  };
  missing_business?: string[];
  missing_legal?: string[];
  optional_branding?: string[];
}

// Readable operator labels for raw DB field keys (fallback: humanise the key).
const FIELD_LABELS: Record<string, string> = {
  manufacturer_name_and_address: "Manufacturer name & address", packer_name_and_address: "Packer name & address",
  consumer_care_contact: "Consumer-care contact", mrp: "MRP (incl. taxes)", country_of_origin: "Country of origin",
  net_quantity_declaration_format: "Net-quantity declaration format", date_of_manufacture_format: "Date-of-manufacture format",
  ingredient_declaration: "Ingredient declaration", safety_warnings: "Safety warnings", licence_numbers: "Licence/registration numbers",
};
export function humaniseField(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
const PURPOSE_LABELS: Record<string, string> = { retail: "Retail", product_batch_id: "Product batch ID", internal_mfg: "Internal (manufacturing)" };
export const purposeLabel = (p: string): string => PURPOSE_LABELS[p] ?? humaniseField(p);

export function LabelPreview({ payload, encodedValue }: { payload: LabelPayload; encodedValue?: string }) {
  const v = payload.verified;
  const sellable = payload.purpose !== "internal_mfg";
  const eligible = v.recall_state === "none" && v.lifecycle_status === "qc_approved";
  const encodedOk = !encodedValue || encodedValue === v.batch_code;
  const missing = [...(payload.missing_business ?? []), ...(payload.missing_legal ?? [])].map(humaniseField);

  return (
    <div className={`label-preview label-preview--${payload.purpose}`} role="group" aria-label={`Label ${v.batch_code}`}>
      {sellable && !eligible ? <p className="label-preview__warn" role="alert">NOT FOR SALE — batch {v.lifecycle_status}{v.recall_state !== "none" ? ` / ${v.recall_state}` : ""}</p> : null}
      {payload.purpose === "internal_mfg" ? <p className="label-preview__tag">INTERNAL — NOT A RETAIL LABEL</p> : null}

      {v.product_name ? <p className="label-preview__name">{v.product_name}{v.variant ? ` · ${v.variant}` : ""}</p> : null}
      {v.net_quantity ? <p className="label-preview__net">Net: {v.net_quantity}</p> : null}
      {v.manufacturing_date ? <p className="label-preview__date">Mfg: {v.manufacturing_date}</p> : null}

      {/* Immutable, human-readable batch code — ALWAYS present. */}
      <p className="label-preview__code" aria-label="Batch code">{v.batch_code}</p>
      {encodedValue ? (
        <p className={`label-preview__encoded${encodedOk ? "" : " label-preview__encoded--bad"}`}>
          encoded: {encodedValue}{encodedOk ? "" : " ✗ MISMATCH"}
        </p>
      ) : null}

      {payload.purpose === "retail" && missing.length ? (
        <p className="label-preview__missing">⚠ Missing before print: {missing.join(", ")}</p>
      ) : null}
    </div>
  );
}
