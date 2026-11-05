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

export function LabelPreview({ payload, encodedValue }: { payload: LabelPayload; encodedValue?: string }) {
  const v = payload.verified;
  const sellable = payload.purpose !== "internal_mfg";
  const eligible = v.recall_state === "none" && v.lifecycle_status === "qc_approved";
  const encodedOk = !encodedValue || encodedValue === v.batch_code;
  const missing = [...(payload.missing_business ?? []), ...(payload.missing_legal ?? [])];

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
