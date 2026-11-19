"use client";

import { useReducer, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Loader2, RotateCcw, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdornedInput, Field } from "@/components/apply/fields";
import { ScreeningResult } from "./screen-result";
import { initialScreenState, screenReducer } from "@/lib/screen-state";
import type { Screening } from "@/lib/types";
import { cn } from "@/lib/utils";

type Values = { loan_amount: string; fico: string; dti: string };

export const SAMPLES: { label: string; values: Values }[] = [
  { label: "Strong", values: { loan_amount: "8,000", fico: "760", dti: "8" } },
  { label: "Borderline", values: { loan_amount: "30,000", fico: "675", dti: "28" } },
  { label: "Below the FICO cut-off", values: { loan_amount: "15,000", fico: "659", dti: "15" } },
  { label: "Invalid input", values: { loan_amount: "15,000", fico: "659.5", dti: "15" } },
];

export function ScreenForm({ initial }: { initial?: Partial<Values> }) {
  const [values, setValues] = useState<Values>(() => ({
    loan_amount: initial?.loan_amount ?? "",
    fico: initial?.fico ?? "",
    dti: initial?.dti ?? "",
  }));
  const [state, dispatch] = useReducer(screenReducer, initialScreenState);
  const seq = useRef(0);
  const resultRef = useRef<HTMLDivElement>(null);

  async function run(v: Values) {
    const mine = ++seq.current;
    dispatch({ type: "submit", seq: mine });
    try {
      const res = await fetch("/api/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        dispatch({ type: "result", seq: mine, result: body as Screening });
        requestAnimationFrame(() => resultRef.current?.focus({ preventScroll: true }));
        return;
      }
      const detail = body?.error?.details?.[0];
      dispatch({
        type: "error",
        seq: mine,
        error: {
          field: detail?.field ?? null,
          message: body?.error?.message ?? (res.status === 429 ? "Too many requests. Please wait a moment." : "Something went wrong. Please try again."),
        },
      });
    } catch {
      dispatch({ type: "error", seq: mine, error: { field: null, message: "Service temporarily unavailable. Please try again in a few minutes." } });
    }
  }

  function set(k: keyof Values, v: string) {
    setValues((s) => ({ ...s, [k]: v }));
  }

  const err = state.error;
  const busy = state.status === "loading";
  const applyHref = state.result
    ? `/apply?loan=${state.result.inputs.loan_amount}&fico=${state.result.inputs.fico}&dti=${state.result.inputs.dti}`
    : "/apply";

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          run(values);
        }}
        className="space-y-5 rounded-lg border border-stone-200 bg-white p-6 lg:sticky lg:top-24"
        aria-describedby={err ? "screen-error" : undefined}
      >
        <div>
          <h2 className="text-lg font-semibold text-navy">Applicant details</h2>
          <p className="mt-1 text-sm text-stone-600">Three inputs, the only ones both LendingClub files record in the same way.</p>
        </div>
        <Field name="loan_amount" label="Loan amount" hint="$500 to $40,000" tooltip="The amount requested, in US dollars. Commas are fine.">
          <AdornedInput name="loan_amount" prefix="$" value={values.loan_amount} onChange={(v) => set("loan_amount", v)} placeholder="15,000" invalid={err?.field === "loan_amount"} hint />
        </Field>
        <Field name="fico" label="FICO score" hint="Whole number, 300 to 850" tooltip="US credit score. Higher is better. LendingClub funded almost no loans below 660.">
          <AdornedInput name="fico" inputMode="numeric" value={values.fico} onChange={(v) => set("fico", v)} placeholder="700" invalid={err?.field === "fico"} hint />
        </Field>
        <Field name="dti" label="Debt-to-income ratio (DTI)" hint="0 to 100" tooltip="Share of monthly income already going to debt payments. Lower is better.">
          <AdornedInput name="dti" suffix="%" value={values.dti} onChange={(v) => set("dti", v)} placeholder="15" invalid={err?.field === "dti"} hint />
        </Field>

        {err && (
          <div id="screen-error" role="alert" className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              <span className="font-semibold">{err.message}</span> Nothing was scored.
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <Button type="submit" variant="brand" size="lg" className="flex-1" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <ScanSearch aria-hidden />} Screen application
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            aria-label="Clear the form"
            onClick={() => {
              setValues({ loan_amount: "", fico: "", dti: "" });
              dispatch({ type: "reset" });
            }}
          >
            <RotateCcw aria-hidden />
          </Button>
        </div>

        <div>
          <p className="text-xs font-medium text-stone-500">Try an example</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SAMPLES.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => {
                  setValues(s.values);
                  run(s.values);
                }}
                className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs text-stone-700 hover:border-stone-300 hover:bg-white"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </form>

      <div ref={resultRef} tabIndex={-1} aria-live="polite" aria-busy={busy} className="outline-none">
        {state.result ? (
          <div className="space-y-4">
            <ScreeningResult
              result={state.result}
              onUseOffer={(amount) => {
                const next = { ...values, loan_amount: String(amount) };
                setValues(next);
                run(next);
              }}
            />
            <div className="flex flex-col gap-3 rounded-lg border border-stone-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-stone-600">
                Want a loan officer to decide? Save these details as an application.
              </p>
              <Link href={applyHref} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-navy px-4 text-sm font-medium text-white hover:bg-navy-800">
                Apply with these details <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
            <p className="text-xs text-stone-500">
              Model {state.result.model_version}
              {typeof state.result.elapsed_ms === "number" && <> · scored in {state.result.elapsed_ms.toFixed(1)} ms</>}
            </p>
          </div>
        ) : (
          <div
            className={cn(
              "flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center",
              busy && "animate-pulse",
            )}
          >
            <ScanSearch className="size-8 text-stone-400" aria-hidden />
            <p className="mt-3 font-medium text-stone-800">{busy ? "Scoring..." : "The result appears here"}</p>
            <p className="mt-1 max-w-sm text-sm text-stone-500">
              You will see the eligibility tier, the charge-off risk tier, the decision and a counter-offer if there is one.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
