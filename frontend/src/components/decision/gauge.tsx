import { cn } from "@/lib/utils";

/** Semicircular gauge (0–1). Purely presentational; the value is also given as text. */
export function Gauge({
  value,
  label,
  tone,
  className,
}: {
  value: number;
  label: string;
  tone: "success" | "danger" | "warning";
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(1, value));
  const r = 80;
  const circumference = Math.PI * r;
  const color = tone === "success" ? "#059669" : tone === "danger" ? "#E11D48" : "#D97706";
  return (
    <figure className={cn("flex flex-col items-center", className)}>
      <svg viewBox="0 0 200 116" className="w-full max-w-[220px]" role="img" aria-label={`${label}: ${Math.round(clamped * 100)}%`}>
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#E7E5E4" strokeWidth="16" strokeLinecap="round" />
        <path
          d="M20 100 A80 80 0 0 1 180 100"
          fill="none"
          stroke={color}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${circumference * clamped} ${circumference}`}
          className="transition-[stroke-dasharray] duration-700"
        />
        <text x="100" y="92" textAnchor="middle" className="fill-stone-900" style={{ fontSize: 32, fontWeight: 700 }}>
          {Math.round(clamped * 100)}%
        </text>
      </svg>
      <figcaption className="-mt-1 text-sm font-medium text-stone-600">{label}</figcaption>
    </figure>
  );
}
