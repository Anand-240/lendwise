"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdornedInput, Field, describedBy, fieldIds } from "./fields";

type Values = {
  loan_amount: string;
  fico: string;
  dti: string;
  purpose: string;
  full_name: string;
  email: string;
  consent: boolean;
};

const selectCls =
  "h-11 w-full rounded-lg border border-input bg-white px-3 text-base text-stone-800 outline-none hover:border-stone-400 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-danger md:text-sm";

export function ApplyForm({ purposes, initial }: { purposes: string[]; initial: Partial<Values> }) {
  const router = useRouter();
  const [v, setV] = useState<Values>({
    loan_amount: initial.loan_amount ?? "",
    fico: initial.fico ?? "",
    dti: initial.dti ?? "",
    purpose: initial.purpose ?? "",
    full_name: "",
    email: "",
    consent: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof Values>(k: K, value: Values[K]) => {
    setV((s) => ({ ...s, [k]: value }));
    setErrors((e) => {
      if (!e[k]) return e;
      const next = { ...e };
      delete next[k];
      return next;
    });
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!v.purpose) local.purpose = "Choose what the loan is for.";
    if (v.full_name.trim().length < 2) local.full_name = "Enter your full name.";
    if (!/^\S+@\S+\.\S+$/.test(v.email.trim())) local.email = "Enter a valid email address.";
    if (!v.consent) local.consent = "Please confirm to continue.";
    if (Object.keys(local).length) {
      setErrors(local);
      setSummary("Please fix the highlighted fields.");
      return;
    }
    setSubmitting(true);
    setSummary(null);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...v, full_name: v.full_name.trim(), email: v.email.trim() }),
      });
      const body = await res.json().catch(() => null);
      if (res.status === 201) {
        toast.success("Application submitted", { description: `Your application ID is ${body.application_id}.` });
        router.push(`/application/${body.application_id}`);
        return;
      }
      const details: { field: string | null; message: string }[] = body?.error?.details ?? [];
      const next: Record<string, string> = {};
      for (const d of details) if (d.field && !next[d.field]) next[d.field] = d.message;
      setErrors(next);
      setSummary(
        res.status === 422
          ? details.length === 1 && details[0].field && ["loan_amount", "fico", "dti"].includes(details[0].field)
            ? `${details[0].message} Nothing was scored or saved.`
            : "Please fix the highlighted fields."
          : body?.error?.message ?? "Something went wrong. Please try again.",
      );
    } catch {
      setSummary("Service temporarily unavailable. Your application has not been submitted. Please try again in a few minutes.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form noValidate onSubmit={submit} className="grid gap-6 lg:grid-cols-2" aria-describedby={summary ? "apply-summary" : undefined}>
      <fieldset className="space-y-5 rounded-lg border border-stone-200 bg-white p-6">
        <legend className="sr-only">Loan details</legend>
        <div>
          <h2 className="text-lg font-semibold text-navy">1. Loan details</h2>
          <p className="mt-1 text-sm text-stone-600">These three values are what the models score.</p>
        </div>
        <Field name="loan_amount" label="Loan amount" hint="$500 to $40,000" error={errors.loan_amount}>
          <AdornedInput name="loan_amount" prefix="$" value={v.loan_amount} onChange={(x) => set("loan_amount", x)} placeholder="15,000" invalid={!!errors.loan_amount} hint />
        </Field>
        <Field name="fico" label="FICO score" hint="Whole number, 300 to 850" error={errors.fico}>
          <AdornedInput name="fico" inputMode="numeric" value={v.fico} onChange={(x) => set("fico", x)} placeholder="700" invalid={!!errors.fico} hint />
        </Field>
        <Field name="dti" label="Debt-to-income ratio (DTI)" hint="0 to 100" error={errors.dti}>
          <AdornedInput name="dti" suffix="%" value={v.dti} onChange={(x) => set("dti", x)} placeholder="15" invalid={!!errors.dti} hint />
        </Field>
        <Field name="purpose" label="What is the loan for?" hint="Recorded for the reviewer. It does not change the score." error={errors.purpose}>
          <select
            id={fieldIds("purpose").input}
            className={selectCls}
            value={v.purpose}
            onChange={(e) => set("purpose", e.target.value)}
            aria-invalid={!!errors.purpose || undefined}
            aria-describedby={describedBy("purpose", true, !!errors.purpose)}
          >
            <option value="">Choose a purpose</option>
            {purposes.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Field>
      </fieldset>

      <fieldset className="space-y-5 rounded-lg border border-stone-200 bg-white p-6">
        <legend className="sr-only">Your details</legend>
        <div>
          <h2 className="text-lg font-semibold text-navy">2. Your details</h2>
          <p className="mt-1 text-sm text-stone-600">Used to send you the decision and let you track the application.</p>
        </div>
        <Field name="full_name" label="Full name" error={errors.full_name}>
          <Input
            id={fieldIds("full_name").input}
            autoComplete="name"
            value={v.full_name}
            onChange={(e) => set("full_name", e.target.value)}
            maxLength={80}
            aria-invalid={!!errors.full_name || undefined}
            aria-describedby={describedBy("full_name", false, !!errors.full_name)}
          />
        </Field>
        <Field name="email" label="Email address" error={errors.email}>
          <Input
            id={fieldIds("email").input}
            type="email"
            autoComplete="email"
            value={v.email}
            onChange={(e) => set("email", e.target.value)}
            aria-invalid={!!errors.email || undefined}
            aria-describedby={describedBy("email", false, !!errors.email)}
          />
        </Field>
        <div className="space-y-2">
          <label className="flex items-start gap-3 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={v.consent}
              onChange={(e) => set("consent", e.target.checked)}
              className="mt-0.5 size-4 accent-[#8A6417]"
              aria-invalid={!!errors.consent || undefined}
              aria-describedby={errors.consent ? "f-consent-error" : undefined}
            />
            <span>
              I understand that LendWise is a prototype, that my details are screened by two machine learning models and reviewed by a
              loan officer, and I agree to the <Link href="/privacy" className="text-brand underline">privacy policy</Link>.
            </span>
          </label>
          {errors.consent && (
            <p id="f-consent-error" role="alert" className="text-xs font-medium text-danger">
              {errors.consent}
            </p>
          )}
        </div>

        {summary && (
          <div id="apply-summary" role="alert" className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>{summary}</p>
          </div>
        )}

        <Button type="submit" variant="brand" size="lg" className="w-full" disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} Submit application
        </Button>
        <p className="text-xs text-stone-500">
          You will see the screening result straight away. A loan officer then makes the final decision and emails you.
        </p>
      </fieldset>
    </form>
  );
}
