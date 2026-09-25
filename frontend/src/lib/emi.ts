/** Standard reducing-balance EMI: P·r·(1+r)^n / ((1+r)^n − 1), r = monthly rate. */
export function calculateEmi(principal: number, annualRatePct: number, months: number): number {
  if (!principal || !months) return 0;
  const r = annualRatePct / 12 / 100;
  if (r === 0) return principal / months;
  const g = Math.pow(1 + r, months);
  return (principal * r * g) / (g - 1);
}

export function emiBreakdown(principal: number, annualRatePct: number, months: number) {
  const emi = calculateEmi(principal, annualRatePct, months);
  const total = emi * months;
  return { emi, total, interest: total - principal };
}

export const DEFAULT_RATE = 10.5;
