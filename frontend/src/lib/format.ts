const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("en-US");

/** $15,000 (cents only when the amount has them). */
export function formatUSD(value: number): string {
  return Number.isInteger(value) ? usd.format(value) : usdCents.format(value);
}

export function formatNumber(value: number): string {
  return num.format(value);
}

/** 0.1382 -> "13.8%" */
export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/** 13.82 (already in percent) -> "13.8%" */
export function formatPct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function formatAuc(value: number): string {
  return value.toFixed(4);
}

export function formatDate(iso: string, withTime = false): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Asia/Kolkata",
  });
}
