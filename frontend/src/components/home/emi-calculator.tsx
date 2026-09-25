"use client";

import { useId, useMemo, useState } from "react";
import { emiBreakdown, DEFAULT_RATE } from "@/lib/emi";
import { formatINR, formatTenure } from "@/lib/format";
import { ButtonLink } from "@/components/site/button-link";

function Row({
  label,
  display,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  display: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <label id={id} className="text-sm text-stone-600">
          {label}
        </label>
        <output aria-labelledby={id} className="text-sm font-semibold text-navy tabular-nums">
          {display}
        </output>
      </div>
      <input
        type="range"
        aria-labelledby={id}
        aria-valuetext={display}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="lw-range mt-1 w-full"
        style={{ ["--fill" as string]: `${((value - min) / (max - min)) * 100}%` }}
      />
    </div>
  );
}

/** Compact EMI calculator used on the home page. */
export function EmiCalculator({ defaultRate = DEFAULT_RATE }: { defaultRate?: number }) {
  const [amount, setAmount] = useState(500_000);
  const [tenure, setTenure] = useState(36);
  const [rate, setRate] = useState(defaultRate);
  const { emi, total, interest } = useMemo(() => emiBreakdown(amount, rate, tenure), [amount, rate, tenure]);

  return (
    <div id="emi-calculator" className="scroll-mt-28 rounded-lg border border-stone-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <div className="border-b border-stone-200 px-5 py-4">
        <h2 className="text-base font-semibold text-navy">EMI calculator</h2>
        <p className="text-xs text-stone-500">Reducing-balance method. Indicative only.</p>
      </div>
      <div className="space-y-5 px-5 py-5">
        <Row label="Loan amount" display={formatINR(amount)} value={amount} min={10_000} max={10_000_000} step={10_000} onChange={setAmount} />
        <Row label="Tenure" display={formatTenure(tenure)} value={tenure} min={6} max={360} step={6} onChange={setTenure} />
        <Row
          label="Interest rate (p.a.)"
          display={`${rate.toFixed(2)}%`}
          value={rate}
          min={6}
          max={24}
          step={0.05}
          onChange={(v) => setRate(Math.round(v * 100) / 100)}
        />
      </div>
      <dl className="grid grid-cols-3 border-t border-stone-200 bg-stone-50 text-center">
        <div className="px-3 py-4">
          <dt className="text-xs text-stone-500">Monthly EMI</dt>
          <dd className="mt-1 text-lg font-semibold text-navy tabular-nums" aria-live="polite">
            {formatINR(Math.round(emi))}
          </dd>
        </div>
        <div className="border-x border-stone-200 px-3 py-4">
          <dt className="text-xs text-stone-500">Total interest</dt>
          <dd className="mt-1 text-sm font-semibold text-stone-800 tabular-nums">{formatINR(Math.round(interest))}</dd>
        </div>
        <div className="px-3 py-4">
          <dt className="text-xs text-stone-500">Total payable</dt>
          <dd className="mt-1 text-sm font-semibold text-stone-800 tabular-nums">{formatINR(Math.round(total))}</dd>
        </div>
      </dl>
      <div className="border-t border-stone-200 p-4">
        <ButtonLink href="/apply" variant="brand" className="w-full">
          Apply for this loan
        </ButtonLink>
      </div>
    </div>
  );
}
