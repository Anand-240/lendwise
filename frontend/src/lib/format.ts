const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inrPaise = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 2 });
const num = new Intl.NumberFormat("en-IN");

/** ₹12,50,000 (Indian digit grouping). */
export function formatINR(value: number, withPaise = false): string {
  return (withPaise ? inrPaise : inr).format(value);
}

export function formatNumber(value: number): string {
  return num.format(value);
}

/** ₹12.5 L / ₹1.2 Cr style compact amounts. */
export function formatLakhCrore(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e7) return `₹${trim(value / 1e7)} Cr`;
  if (abs >= 1e5) return `₹${trim(value / 1e5)} L`;
  if (abs >= 1e3) return `₹${trim(value / 1e3)}K`;
  return formatINR(value);
}

function trim(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, "");
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatTenure(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts = [];
  if (y) parts.push(`${y} yr${y > 1 ? "s" : ""}`);
  if (m) parts.push(`${m} mo`);
  return parts.join(" ") || "0 mo";
}

export function formatDate(iso: string, withTime = false): string {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Asia/Kolkata",
  });
}

/** Parses "12,50,000" / "₹ 5L"-ish user input into an integer (digits only). */
export function parseAmount(raw: string): number | undefined {
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? Number(digits) : undefined;
}
