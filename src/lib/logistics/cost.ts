/**
 * Cost Engine (§9) — the true logistics cost of a shipment, split so profit-per-order
 * is accurate: courier + packaging + insurance + COD fee + fuel surcharge + tax.
 * Pure; all inputs in rupees.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface LogisticsCostInput {
  courierCost: number;
  packagingCost: number;
  declaredValueInr: number;
  insured: boolean;
  insuranceRatePct?: number; // % of declared value when insured
  cod: boolean;
  codFeeFlat?: number;
  codFeePct?: number; // % of declared value
  fuelSurchargePct?: number; // % of courier cost
  taxPct?: number; // GST on logistics services (e.g. 18)
}

export interface LogisticsCost {
  courierCost: number;
  packagingCost: number;
  insurance: number;
  codFee: number;
  fuelSurcharge: number;
  tax: number;
  total: number;
}

export function computeLogisticsCost(i: LogisticsCostInput): LogisticsCost {
  const insurance = i.insured ? r2(i.declaredValueInr * ((i.insuranceRatePct ?? 0) / 100)) : 0;
  const codFee = i.cod ? r2((i.codFeeFlat ?? 0) + i.declaredValueInr * ((i.codFeePct ?? 0) / 100)) : 0;
  const fuelSurcharge = r2(i.courierCost * ((i.fuelSurchargePct ?? 0) / 100));
  const taxable = i.courierCost + i.packagingCost + insurance + codFee + fuelSurcharge;
  const tax = r2(taxable * ((i.taxPct ?? 0) / 100));
  return {
    courierCost: r2(i.courierCost),
    packagingCost: r2(i.packagingCost),
    insurance,
    codFee,
    fuelSurcharge,
    tax,
    total: r2(taxable + tax),
  };
}
