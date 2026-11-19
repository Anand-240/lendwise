import { ArrowDownRight, CheckCircle2, CircleHelp, ShieldAlert, XCircle } from "lucide-react";
import { formatPct, formatUSD } from "@/lib/format";
import type { EligibilityTier, Recommendation, RiskTier, Screening } from "@/lib/types";
import { cn } from "@/lib/utils";

export const DECISION_COPY: Record<Recommendation, { label: string; short: string; text: string; tone: string; icon: typeof CheckCircle2 }> = {
  APPROVE: {
    label: "Approve",
    short: "Approve",
    text: "The application passes the eligibility screen and its expected loss is within the approval limit.",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
    icon: CheckCircle2,
  },
  REVIEW: {
    label: "Send for review",
    short: "Review",
    text: "The application is not clearly in or out. A human reviewer should look at it.",
    tone: "border-amber-200 bg-amber-50 text-amber-900",
    icon: CircleHelp,
  },
  REJECT: {
    label: "Reject",
    short: "Reject",
    text: "The application fails the eligibility screen or its expected loss is too high.",
    tone: "border-rose-200 bg-rose-50 text-rose-900",
    icon: XCircle,
  },
};

const ELIGIBILITY_TONE: Record<EligibilityTier, string> = {
  Likely: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  Borderline: "bg-amber-50 text-amber-800 ring-amber-200",
  Unlikely: "bg-rose-50 text-rose-800 ring-rose-200",
};
const RISK_TONE: Record<RiskTier, string> = {
  Low: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  Moderate: "bg-amber-50 text-amber-800 ring-amber-200",
  High: "bg-rose-50 text-rose-800 ring-rose-200",
};

export function TierBadge({ tier, kind }: { tier: EligibilityTier | RiskTier; kind: "eligibility" | "risk" }) {
  const cls = kind === "eligibility" ? ELIGIBILITY_TONE[tier as EligibilityTier] : RISK_TONE[tier as RiskTier];
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1", cls)}>
      {tier}
      {kind === "risk" ? " risk" : ""}
    </span>
  );
}

export function RecommendationBadge({ decision }: { decision: Recommendation }) {
  const d = DECISION_COPY[decision];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold", d.tone)}>
      <d.icon className="size-3.5" aria-hidden /> {d.short}
    </span>
  );
}

/** A 0 to max bar with coloured zones split at two thresholds and a marker for the value. */
function ScaleBar({
  value,
  max,
  cuts,
  zones,
  label,
  format,
}: {
  value: number;
  max: number;
  cuts: [number, number];
  zones: [string, string, string];
  label: string;
  format: (v: number) => string;
}) {
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;
  return (
    <div className="mt-3" role="img" aria-label={`${label}: ${format(value)}`}>
      <div className="relative h-2.5 overflow-hidden rounded-full">
        <div className="absolute inset-y-0 left-0" style={{ width: pct(cuts[0]), background: zones[0] }} />
        <div className="absolute inset-y-0" style={{ left: pct(cuts[0]), width: `calc(${pct(cuts[1])} - ${pct(cuts[0])})`, background: zones[1] }} />
        <div className="absolute inset-y-0 right-0" style={{ left: pct(cuts[1]), background: zones[2] }} />
      </div>
      <div className="relative h-5">
        <span className="absolute -top-4 h-4 w-0.5 -translate-x-1/2 rounded bg-navy" style={{ left: pct(value) }} aria-hidden />
        {cuts.map((c) => (
          <span key={c} className="absolute top-0.5 -translate-x-1/2 text-[10px] text-stone-500 tabular-nums" style={{ left: pct(c) }}>
            {format(c)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ScreeningResult({
  result,
  onUseOffer,
  compact = false,
}: {
  result: Screening;
  onUseOffer?: (amount: number) => void;
  compact?: boolean;
}) {
  const d = DECISION_COPY[result.decision];
  const e = result.eligibility;
  const r = result.charge_off;
  const offer = result.counter_offer;

  return (
    <div className="space-y-4">
      <div className={cn("flex gap-3 rounded-lg border p-4", d.tone)}>
        <d.icon className="mt-0.5 size-6 shrink-0" aria-hidden />
        <div>
          <p className="text-xs font-semibold tracking-wide uppercase opacity-80">Decision</p>
          <p className="text-xl font-semibold">{d.label}</p>
          <p className="mt-1 text-sm">{d.text}</p>
        </div>
      </div>

      <div className={cn("grid gap-4", !compact && "sm:grid-cols-2")}>
        <section className="rounded-lg border border-stone-200 bg-white p-4" aria-labelledby="elig-h">
          <div className="flex items-start justify-between gap-2">
            <h3 id="elig-h" className="text-sm font-medium text-stone-600">Eligibility score</h3>
            <TierBadge tier={e.tier} kind="eligibility" />
          </div>
          <p className="mt-1 text-3xl font-semibold text-navy tabular-nums">
            {e.score.toFixed(1)}
            <span className="text-base font-normal text-stone-500"> / 100</span>
          </p>
          <ScaleBar value={e.score} max={100} cuts={[40, 75]} zones={["#fecdd3", "#fde68a", "#a7f3d0"]} label="Eligibility score" format={(v) => v.toFixed(0)} />
          <p className="text-xs leading-relaxed text-stone-500">
            How closely the application resembles ones LendingClub accepted. It is not the chance of approval.
          </p>
        </section>

        <section className="rounded-lg border border-stone-200 bg-white p-4" aria-labelledby="risk-h">
          <div className="flex items-start justify-between gap-2">
            <h3 id="risk-h" className="text-sm font-medium text-stone-600">Charge-off risk</h3>
            {r && <TierBadge tier={r.tier} kind="risk" />}
          </div>
          {r ? (
            <>
              <p className="mt-1 text-3xl font-semibold text-navy tabular-nums">{formatPct(r.probability)}</p>
              <ScaleBar value={r.probability} max={35} cuts={[12, 22]} zones={["#a7f3d0", "#fde68a", "#fecdd3"]} label="Default probability" format={(v) => `${v.toFixed(0)}%`} />
              <p className="text-xs leading-relaxed text-stone-500">
                Chance a similar 36-month loan is not repaid. Expected loss {formatPct(r.expected_loss, 2)} of the principal.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-stone-600">
              Not shown, because the eligibility tier is Unlikely. The application is screened out before the risk model is used.
            </p>
          )}
        </section>
      </div>

      {result.guard.flagged && (
        <div role="note" className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">Range guard flag</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {result.guard.reasons.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <p className="mt-1">A flagged case is never approved automatically. It goes to a reviewer instead.</p>
          </div>
        </div>
      )}

      {result.reasons.length > 0 && (
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <h3 className="text-sm font-medium text-stone-600">Why</h3>
          <ul className="mt-2 space-y-1 text-sm text-stone-800">
            {result.reasons.map((x) => (
              <li key={x} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-stone-400" aria-hidden /> {x}
              </li>
            ))}
          </ul>
        </div>
      )}

      {offer ? (
        <div className="flex flex-col gap-3 rounded-lg border border-brand-line bg-brand-soft p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <ArrowDownRight className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-brand-deep">Counter-offer: {formatUSD(offer.loan_amount)}</p>
              <p className="text-sm text-stone-700">
                The largest smaller amount, in $500 steps, that the rules would approve. Eligibility {offer.eligibility.score.toFixed(1)}, charge-off risk{" "}
                {formatPct(offer.charge_off.probability)}.
              </p>
            </div>
          </div>
          {onUseOffer && (
            <button
              type="button"
              onClick={() => onUseOffer(offer.loan_amount)}
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-brand-line bg-white px-3 text-sm font-medium text-brand-deep hover:bg-stone-50"
            >
              Use this amount
            </button>
          )}
        </div>
      ) : (
        result.decision !== "APPROVE" && (
          <p className="rounded-lg border border-stone-200 bg-white p-4 text-sm text-stone-600">
            No counter-offer: no smaller amount in $500 steps would be approved with this FICO score and DTI.
          </p>
        )
      )}
    </div>
  );
}
