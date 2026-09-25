"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Home,
  Loader2,
  Lock,
  Pencil,
  TriangleAlert,
  User,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AmountInput, Combobox, Field, RadioCards, describedBy, fieldIds } from "./fields";
import { PhoneVerify } from "./phone-verify";
import { buildApplicationSchema, rangeWarnings, STEP_FIELDS, type ApplicationForm } from "@/lib/schema";
import { calculateEmi } from "@/lib/emi";
import { formatINR, formatLakhCrore, formatTenure } from "@/lib/format";
import { PHONE_OTP_ENABLED, PURPOSES } from "@/lib/site";
import type { ApiError, Metadata } from "@/lib/types";
import { cn } from "@/lib/utils";

const STEPS = [
  { title: "Personal details", short: "Personal", icon: User, description: "Tell us who you are." },
  { title: "Employment & income", short: "Employment", icon: Briefcase, description: "Your work history and earnings." },
  { title: "Residence & assets", short: "Residence", icon: Home, description: "Where you live and what you own." },
  { title: "Loan details", short: "Loan", icon: Wallet, description: "How much you need and for how long." },
  { title: "Review & submit", short: "Review", icon: ClipboardCheck, description: "Check everything before you submit." },
];

const DRAFT_KEY = "lendwise-apply-draft-v1";
const TENURE_PRESETS = [12, 24, 36, 60, 120, 240];
const ASSESS_STEPS = ["Verifying details", "Running risk model", "Finalizing decision"];

type FormValues = ApplicationForm;
type Phase = "form" | "assessing";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ApplyWizard({ metadata }: { metadata: Metadata }) {
  const router = useRouter();
  const schema = useMemo(() => buildApplicationSchema(metadata), [metadata]);
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [phase, setPhase] = useState<Phase>("form");
  const [assessIndex, setAssessIndex] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const restored = useRef(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { consent: false } as Partial<FormValues>,
  });
  const { register, control, handleSubmit, trigger, setValue, getValues, setError, reset, formState } = form;
  const { errors, isSubmitting } = formState;
  const values = useWatch({ control }) as Partial<FormValues>;

  // Restore an in-progress draft (same tab only).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const { values: v, step: s, maxStep: m } = JSON.parse(raw);
        reset({ ...v, consent: false });
        // Restoring from sessionStorage (an external store) must happen after hydration.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStep(Math.min(s ?? 0, 3));
        setMaxStep(Math.min(m ?? 0, 4));
      }
    } catch {
      /* ignore corrupt drafts */
    }
    // Loan-type links on the home page preselect the purpose (/apply?purpose=Home).
    const purpose = new URLSearchParams(window.location.search).get("purpose");
    if (purpose && (PURPOSES as readonly string[]).includes(purpose)) {
      setValue("purpose", purpose as FormValues["purpose"]);
    }
    restored.current = true;
  }, [reset, setValue]);

  useEffect(() => {
    if (!restored.current) return;
    const rest: Partial<FormValues> = { ...values };
    delete rest.consent;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ values: rest, step, maxStep }));
    } catch {
      /* storage unavailable */
    }
  }, [values, step, maxStep]);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const cityOptions = useMemo(() => {
    if (!values.state) return [];
    const allowed = new Set(metadata.state_to_cities[values.state] ?? []);
    return metadata.options.city.filter((c) => allowed.has(c.value));
  }, [values.state, metadata]);

  const warnings = rangeWarnings(values, metadata);
  const emi =
    values.loan_amount && values.tenure_months && values.loan_amount >= 10_000 && values.tenure_months >= 6
      ? calculateEmi(values.loan_amount, metadata.interest_rate, values.tenure_months)
      : null;

  const labelOf = (key: keyof Metadata["options"], v?: string) =>
    metadata.options[key].find((o) => o.value === v)?.label ?? v ?? "—";

  async function next() {
    const ok = await trigger(STEP_FIELDS[step] as FieldPath<FormValues>[], { shouldFocus: true });
    if (!ok) return;
    const s = Math.min(step + 1, STEPS.length - 1);
    setStep(s);
    setMaxStep((m) => Math.max(m, s));
  }

  function goTo(s: number) {
    if (s <= maxStep) setStep(s);
  }

  const onSubmit = handleSubmit(
    async (data) => {
      setPhase("assessing");
      setAssessIndex(0);
      const ticker = setInterval(() => setAssessIndex((i) => Math.min(i + 1, ASSESS_STEPS.length - 1)), 900);
      try {
        const [res] = await Promise.all([
          fetch("/api/applications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          }),
          sleep(2600),
        ]);
        const body = await res.json().catch(() => null);
        if (res.status === 201 && body?.application_id) {
          clearInterval(ticker);
          setAssessIndex(ASSESS_STEPS.length);
          try {
            sessionStorage.removeItem(DRAFT_KEY);
          } catch {}
          await sleep(400);
          router.push(`/application/${body.application_id}`);
          return;
        }
        clearInterval(ticker);
        setPhase("form");
        handleApiError(res.status, body as ApiError | null);
      } catch {
        clearInterval(ticker);
        setPhase("form");
        toast.error("Service temporarily unavailable", { description: "We couldn’t reach the decision service. Please try again shortly." });
      }
    },
    (errs) => {
      const first = STEP_FIELDS.findIndex((fields) => fields.some((f) => f in errs));
      if (first >= 0 && first !== step) setStep(first);
    },
  );

  function handleApiError(status: number, body: ApiError | null) {
    const message = body?.error?.message ?? "Something went wrong. Please try again.";
    if (status === 422 && body?.error?.details?.length) {
      let firstStep = STEPS.length - 1;
      for (const d of body.error.details) {
        const field = d.field as keyof FormValues | null;
        if (!field) continue;
        const idx = STEP_FIELDS.findIndex((fs) => fs.includes(field));
        if (idx >= 0) {
          setError(field, { type: "server", message: d.message });
          firstStep = Math.min(firstStep, idx);
        }
      }
      setStep(firstStep);
      toast.error("Please review your details", { description: message });
    } else if (status === 429) {
      toast.error("Too many attempts", { description: message });
    } else if (status === 503) {
      toast.error("Service temporarily unavailable", { description: message });
    } else {
      toast.error("Submission failed", { description: message });
    }
  }

  const err = (name: keyof FormValues) => errors[name]?.message as string | undefined;
  const numberProps = (name: keyof FormValues, hint = false) => ({
    id: fieldIds(name).input,
    type: "number" as const,
    inputMode: "numeric" as const,
    "aria-invalid": !!errors[name] || undefined,
    "aria-describedby": describedBy(name, hint, !!errors[name]),
    ...register(name, { setValueAs: (v: string) => (v === "" || v === null ? undefined : Number(v)) }),
  });

  if (phase === "assessing") {
    return <AssessingScreen index={assessIndex} />;
  }

  const current = STEPS[step];

  return (
    <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
      {/* Stepper */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <nav aria-label="Application progress">
          <p className="mb-3 text-sm text-stone-600 lg:hidden">
            Step {step + 1} of {STEPS.length}
          </p>
          <div className="mb-4 h-1.5 rounded-full bg-stone-200 lg:hidden" aria-hidden>
            <div className="h-1.5 rounded-full bg-brand transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
          <ol className="hidden space-y-1 lg:block">
            {STEPS.map((s, i) => {
              const done = i !== step && i < maxStep;
              const active = i === step;
              const reachable = i <= maxStep;
              return (
                <li key={s.title}>
                  <button
                    type="button"
                    onClick={() => goTo(i)}
                    disabled={!reachable}
                    aria-current={active ? "step" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm transition-colors",
                      active ? "bg-white font-semibold text-navy border border-stone-200" : "text-stone-600",
                      reachable && !active && "hover:bg-white/70",
                      !reachable && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                        active && "border-brand bg-brand text-white",
                        done && !active && "border-emerald-600 bg-emerald-600 text-white",
                        !active && !done && "border-stone-300 bg-white text-stone-500",
                      )}
                    >
                      {done && !active ? <Check className="size-4" aria-hidden /> : i + 1}
                    </span>
                    <span>
                      {s.title}
                      <span className="sr-only">{done ? " (completed)" : active ? " (current)" : ""}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        <p className="mt-6 hidden items-start gap-2 rounded-md bg-white p-4 text-xs leading-relaxed text-stone-600 ring-1 ring-stone-200 lg:flex">
          <Lock className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
          Your details are sent securely and used only to assess this application.
        </p>
      </aside>

      <form
        onSubmit={onSubmit}
        noValidate
        className="min-w-0"
        onKeyDown={(e) => {
          // Enter advances steps instead of submitting early.
          if (e.key === "Enter" && step < STEPS.length - 1 && (e.target as HTMLElement).tagName === "INPUT") {
            e.preventDefault();
            void next();
          }
        }}
      >
        <div className="rounded-lg bg-white border border-stone-200">
          <div className="border-b border-stone-200 p-6 md:px-8">
            <div>
              <p className="text-xs font-medium text-stone-500">
                Step {step + 1} of {STEPS.length}
              </p>
              <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold text-navy outline-none">
                {current.title}
              </h2>
              <p className="text-sm text-stone-600">{current.description}</p>
            </div>
          </div>

          <div className="space-y-6 p-6 md:p-8">
            {step === 0 && (
              <div className="grid gap-6 md:grid-cols-2">
                <Field name="full_name" label="Full name" tooltip="As it appears on your PAN or Aadhaar card." error={err("full_name")} className="md:col-span-2">
                  <Input
                    id={fieldIds("full_name").input}
                    autoComplete="name"
                    placeholder="e.g. Priya Sharma"
                    aria-invalid={!!errors.full_name || undefined}
                    aria-describedby={describedBy("full_name", false, !!errors.full_name)}
                    {...register("full_name")}
                  />
                </Field>
                <Field name="email" label="Email address" tooltip="We use this to identify your application when you check its status." error={err("email")}>
                  <Input
                    id={fieldIds("email").input}
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    aria-invalid={!!errors.email || undefined}
                    aria-describedby={describedBy("email", false, !!errors.email)}
                    {...register("email")}
                  />
                </Field>
                <Field name="phone" label="Mobile number" tooltip="A 10-digit Indian mobile number." hint="10 digits, starting with 6, 7, 8 or 9" error={err("phone")}>
                  <div className="flex">
                    <span className="inline-flex items-center rounded-l-lg border border-r-0 border-input bg-stone-50 px-3 text-sm text-stone-600">+91</span>
                    <Input
                      id={fieldIds("phone").input}
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      maxLength={10}
                      placeholder="98765 43210"
                      className="rounded-l-none"
                      aria-invalid={!!errors.phone || undefined}
                      aria-describedby={describedBy("phone", true, !!errors.phone)}
                      {...register("phone", {
                        setValueAs: (v: string) => (v ?? "").replace(/\D/g, ""),
                        // Changing the number invalidates any earlier verification.
                        onChange: () => {
                          if (getValues("phone_verification_token")) setValue("phone_verification_token", "");
                        },
                      })}
                    />
                  </div>
                </Field>
                {PHONE_OTP_ENABLED && (
                <div className="md:col-span-2" id={fieldIds("phone_verification_token").input} tabIndex={-1}>
                  <PhoneVerify
                    phone={values.phone}
                    verified={!!values.phone_verification_token}
                    error={err("phone_verification_token")}
                    onVerified={(token) => setValue("phone_verification_token", token, { shouldValidate: true })}
                  />
                  {errors.phone_verification_token && (
                    <p id={fieldIds("phone_verification_token").error} role="alert" className="mt-2 text-xs font-medium text-danger">
                      {errors.phone_verification_token.message}
                    </p>
                  )}
                </div>
                )}
                <Field name="age" label="Age" tooltip="Applicants must be between 21 and 79 years old." hint="21 – 79 years" error={err("age")}>
                  <Input min={21} max={79} placeholder="e.g. 32" {...numberProps("age", true)} />
                </Field>
                <Field name="marital_status" label="Marital status" as="fieldset" error={err("marital_status")}>
                  <Controller
                    control={control}
                    name="marital_status"
                    render={({ field }) => (
                      <RadioCards name="marital_status" options={metadata.options.marital_status} value={field.value} onChange={field.onChange} invalid={!!errors.marital_status} />
                    )}
                  />
                </Field>
              </div>
            )}

            {step === 1 && (
              <div className="grid gap-6 md:grid-cols-2">
                <Field name="profession" label="Profession" tooltip="Choose the option closest to your current role." error={err("profession")} className="md:col-span-2">
                  <Controller
                    control={control}
                    name="profession"
                    render={({ field }) => (
                      <Combobox
                        name="profession"
                        options={metadata.options.profession}
                        value={field.value}
                        onChange={(v) => {
                          field.onChange(v);
                          field.onBlur();
                        }}
                        placeholder="Select your profession"
                        searchPlaceholder="Search professions…"
                        invalid={!!errors.profession}
                      />
                    )}
                  />
                </Field>
                <Field name="experience" label="Total work experience (years)" tooltip="Total years you have worked, across all employers." error={err("experience")}>
                  <Input min={0} max={61} placeholder="e.g. 8" {...numberProps("experience")} />
                </Field>
                <Field name="current_job_years" label="Years in current job" tooltip="How long you have been with your current employer. Cannot exceed total experience." error={err("current_job_years")}>
                  <Input min={0} max={61} placeholder="e.g. 3" {...numberProps("current_job_years")} />
                </Field>
                <Field
                  name="income"
                  label="Annual income"
                  tooltip="Your gross yearly income before tax, in Indian Rupees."
                  hint={values.income ? `≈ ${formatLakhCrore(values.income)} per year` : "Gross yearly income in ₹"}
                  error={err("income")}
                  className="md:col-span-2"
                >
                  <Controller
                    control={control}
                    name="income"
                    render={({ field }) => (
                      <AmountInput name="income" value={field.value} onChange={field.onChange} onBlur={field.onBlur} invalid={!!errors.income} hint placeholder="e.g. 12,00,000" />
                    )}
                  />
                </Field>
              </div>
            )}

            {step === 2 && (
              <div className="grid gap-6 md:grid-cols-2">
                <Field name="state" label="State" tooltip="The state you currently live in." error={err("state")}>
                  <Controller
                    control={control}
                    name="state"
                    render={({ field }) => (
                      <Combobox
                        name="state"
                        options={metadata.options.state}
                        value={field.value}
                        onChange={(v) => {
                          field.onChange(v);
                          field.onBlur();
                          const city = getValues("city");
                          if (city && !(metadata.state_to_cities[v] ?? []).includes(city)) {
                            setValue("city", undefined as unknown as string);
                          }
                        }}
                        placeholder="Select state"
                        searchPlaceholder="Search states…"
                        invalid={!!errors.state}
                      />
                    )}
                  />
                </Field>
                <Field name="city" label="City" tooltip="Cities are filtered by the selected state." hint={!values.state ? "Select a state first" : undefined} error={err("city")}>
                  <Controller
                    control={control}
                    name="city"
                    render={({ field }) => (
                      <Combobox
                        name="city"
                        options={cityOptions}
                        value={field.value}
                        onChange={(v) => {
                          field.onChange(v);
                          field.onBlur();
                        }}
                        placeholder={values.state ? "Select city" : "Select a state first"}
                        searchPlaceholder="Search cities…"
                        disabled={!values.state}
                        invalid={!!errors.city}
                        hint={!values.state}
                      />
                    )}
                  />
                </Field>
                <Field name="house_ownership" label="House ownership" as="fieldset" tooltip="Whether you own or rent the home you live in." error={err("house_ownership")} className="md:col-span-2">
                  <Controller
                    control={control}
                    name="house_ownership"
                    render={({ field }) => (
                      <RadioCards
                        name="house_ownership"
                        columns={3}
                        options={metadata.options.house_ownership}
                        value={field.value}
                        onChange={field.onChange}
                        invalid={!!errors.house_ownership}
                      />
                    )}
                  />
                </Field>
                <Field name="current_house_years" label="Years at current residence" tooltip="How long you have lived at your current address." error={err("current_house_years")}>
                  <Input min={0} max={79} placeholder="e.g. 5" {...numberProps("current_house_years")} />
                </Field>
                <Field name="car_ownership" label="Do you own a car?" as="fieldset" error={err("car_ownership")}>
                  <Controller
                    control={control}
                    name="car_ownership"
                    render={({ field }) => (
                      <RadioCards name="car_ownership" options={metadata.options.car_ownership} value={field.value} onChange={field.onChange} invalid={!!errors.car_ownership} />
                    )}
                  />
                </Field>
              </div>
            )}

            {step === 3 && (
              <div className="grid gap-6 md:grid-cols-2">
                <div className="md:col-span-2 flex gap-3 rounded-md border border-brand-line bg-brand-soft p-4 text-sm text-stone-700">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                  <p>
                    Loan amount, tenure and purpose are recorded with your application and used for the EMI estimate.
                    They are <strong>not</strong> inputs to the risk model — the decision is based on your applicant profile.
                  </p>
                </div>
                <Field
                  name="loan_amount"
                  label="Loan amount"
                  tooltip="Between ₹10,000 and ₹1,00,00,000."
                  hint={values.loan_amount ? `≈ ${formatLakhCrore(values.loan_amount)}` : "₹10,000 – ₹1,00,00,000"}
                  error={err("loan_amount")}
                >
                  <Controller
                    control={control}
                    name="loan_amount"
                    render={({ field }) => (
                      <AmountInput name="loan_amount" value={field.value} onChange={field.onChange} onBlur={field.onBlur} invalid={!!errors.loan_amount} hint placeholder="e.g. 5,00,000" />
                    )}
                  />
                </Field>
                <Field
                  name="tenure_months"
                  label="Tenure (months)"
                  tooltip="Repayment period between 6 and 360 months."
                  hint={values.tenure_months ? formatTenure(values.tenure_months) : "6 – 360 months"}
                  error={err("tenure_months")}
                >
                  <Input min={6} max={360} placeholder="e.g. 36" {...numberProps("tenure_months", true)} />
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Quick tenure options">
                    {TENURE_PRESETS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setValue("tenure_months", m, { shouldValidate: true, shouldDirty: true })}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                          values.tenure_months === m ? "border-brand bg-brand-soft text-navy" : "border-stone-200 text-stone-600 hover:border-stone-400",
                        )}
                      >
                        {m >= 12 && m % 12 === 0 ? `${m / 12} yr${m > 12 ? "s" : ""}` : `${m} mo`}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field name="purpose" label="Purpose of loan" as="fieldset" error={err("purpose")} className="md:col-span-2">
                  <Controller
                    control={control}
                    name="purpose"
                    render={({ field }) => (
                      <RadioCards
                        name="purpose"
                        columns={4}
                        options={PURPOSES.map((p) => ({ value: p, label: p }))}
                        value={field.value}
                        onChange={field.onChange}
                        invalid={!!errors.purpose}
                      />
                    )}
                  />
                </Field>
                <div className="md:col-span-2 rounded-md bg-navy p-5 text-white" aria-live="polite">
                  <p className="text-sm text-gold-light">Indicative EMI at {metadata.interest_rate}% p.a.</p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums">{emi ? `${formatINR(Math.round(emi))}/month` : "—"}</p>
                  {emi && values.tenure_months && (
                    <p className="mt-1 text-xs text-gold-light">
                      Total payable {formatINR(Math.round(emi * values.tenure_months))} over {formatTenure(values.tenure_months)}. Indicative only.
                    </p>
                  )}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6">
                <ReviewSection title="Personal details" onEdit={() => setStep(0)}>
                  <ReviewItem label="Full name" value={values.full_name} />
                  <ReviewItem label="Email" value={values.email} />
                  <ReviewItem label="Mobile" value={values.phone ? `+91 ${values.phone}${PHONE_OTP_ENABLED ? " · verified" : ""}` : undefined} />
                  <ReviewItem label="Age" value={values.age} />
                  <ReviewItem label="Marital status" value={labelOf("marital_status", values.marital_status)} />
                </ReviewSection>
                <ReviewSection title="Employment & income" onEdit={() => setStep(1)}>
                  <ReviewItem label="Profession" value={labelOf("profession", values.profession)} />
                  <ReviewItem label="Total experience" value={values.experience !== undefined ? `${values.experience} yrs` : undefined} />
                  <ReviewItem label="Years in current job" value={values.current_job_years !== undefined ? `${values.current_job_years} yrs` : undefined} />
                  <ReviewItem label="Annual income" value={values.income !== undefined ? formatINR(values.income) : undefined} />
                </ReviewSection>
                <ReviewSection title="Residence & assets" onEdit={() => setStep(2)}>
                  <ReviewItem label="City, State" value={`${labelOf("city", values.city)}, ${labelOf("state", values.state)}`} />
                  <ReviewItem label="House ownership" value={labelOf("house_ownership", values.house_ownership)} />
                  <ReviewItem label="Years at residence" value={values.current_house_years !== undefined ? `${values.current_house_years} yrs` : undefined} />
                  <ReviewItem label="Car ownership" value={labelOf("car_ownership", values.car_ownership)} />
                </ReviewSection>
                <ReviewSection title="Loan details" onEdit={() => setStep(3)}>
                  <ReviewItem label="Amount" value={values.loan_amount ? formatINR(values.loan_amount) : undefined} />
                  <ReviewItem label="Tenure" value={values.tenure_months ? formatTenure(values.tenure_months) : undefined} />
                  <ReviewItem label="Purpose" value={values.purpose} />
                  <ReviewItem label="Indicative EMI" value={emi ? formatINR(Math.round(emi)) : undefined} />
                </ReviewSection>

                <div className={cn("rounded-md border p-4", errors.consent ? "border-danger/50 bg-rose-50/50" : "border-stone-200 bg-stone-50")}>
                  <Controller
                    control={control}
                    name="consent"
                    render={({ field }) => (
                      <label htmlFor={fieldIds("consent").input} className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-stone-700">
                        <input
                          type="checkbox"
                          id={fieldIds("consent").input}
                          checked={!!field.value}
                          onChange={(e) => field.onChange(e.target.checked)}
                          onBlur={field.onBlur}
                          aria-invalid={!!errors.consent || undefined}
                          aria-describedby={describedBy("consent", false, !!errors.consent)}
                          className="mt-0.5 size-5 shrink-0 cursor-pointer rounded border-input accent-[#8A6417]"
                        />
                        <span>
                          I confirm the information above is accurate and I consent to LendWise processing it to assess this application using an
                          automated machine-learning model, as described in the{" "}
                          <a href="/privacy" target="_blank" className="font-medium text-brand underline underline-offset-2">
                            privacy policy
                          </a>
                          . I understand this decision is not an actual credit offer.
                        </span>
                      </label>
                    )}
                  />
                  {errors.consent && (
                    <p id={fieldIds("consent").error} role="alert" className="mt-2 pl-8 text-xs font-medium text-danger">
                      {errors.consent.message}
                    </p>
                  )}
                </div>
              </div>
            )}

            {(step === 1 || step === 2) && warnings.length > 0 && (
              <ul className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" aria-live="polite">
                {warnings.map((w) => (
                  <li key={w} className="flex gap-2">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {w}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-stone-100 p-6 sm:flex-row sm:items-center sm:justify-between md:px-8">
            <Button type="button" variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="sm:w-auto">
              <ArrowLeft aria-hidden /> Back
            </Button>
            {/* Distinct keys stop React reusing the Continue button as the submit button mid-click. */}
            {step < STEPS.length - 1 ? (
              <Button key="continue" type="button" variant="brand" size="lg" onClick={next}>
                Continue <ArrowRight aria-hidden />
              </Button>
            ) : (
              <Button key="submit" type="submit" variant="brand" size="lg" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />}
                Submit Application
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

function ReviewSection({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-stone-200">
      <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-navy">{title}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${title}`}>
          <Pencil aria-hidden /> Edit
        </Button>
      </div>
      <dl className="grid gap-x-6 gap-y-3 p-4 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function ReviewItem({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-stone-900">{value ?? "—"}</dd>
    </div>
  );
}

function AssessingScreen({ index }: { index: number }) {
  return (
    <div className="mx-auto max-w-lg py-10" role="status" aria-live="polite">
      <div className="rounded-lg bg-white p-8 text-center border border-stone-200">
        <span className="mx-auto flex size-16 items-center justify-center rounded-lg bg-brand-soft">
          <Loader2 className="size-8 animate-spin text-brand" aria-hidden />
        </span>
        <h2 className="mt-6 text-2xl font-semibold text-navy">Assessing your application…</h2>
        <p className="mt-2 text-sm text-stone-600">This usually takes just a few seconds. Please don’t close this page.</p>
        <ol className="mx-auto mt-8 max-w-xs space-y-4 text-left">
          {ASSESS_STEPS.map((label, i) => {
            const done = i < index;
            const active = i === index;
            return (
              <li key={label} className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full border transition-colors",
                    done && "border-emerald-600 bg-emerald-600 text-white",
                    active && "border-brand text-brand",
                    !done && !active && "border-stone-300 text-stone-300",
                  )}
                >
                  {done ? <Check className="size-4" aria-hidden /> : active ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <span className="size-1.5 rounded-full bg-current" />}
                </span>
                <span className={cn("text-sm", done ? "text-stone-900" : active ? "font-medium text-navy" : "text-stone-500")}>
                  {label}
                  <span className="sr-only">{done ? " — done" : active ? " — in progress" : ""}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
