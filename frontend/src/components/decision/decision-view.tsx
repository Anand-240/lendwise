"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  Download,
  FileCheck2,
  FlaskConical,
  Lightbulb,
  Loader2,
  Plus,
  Printer,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  UserCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ButtonLink } from "@/components/site/button-link";
import { Disclaimer } from "@/components/site/disclaimer";
import { Gauge } from "./gauge";
import { EmailPreview, EmailStatusBadge, type PreviewEmail } from "@/components/site/email-preview";
import { formatDate, formatINR, formatLakhCrore, formatNumber, formatPercent, formatTenure } from "@/lib/format";
import type { ApplicationResult, DecidedResult, RiskBand } from "@/lib/types";
import { PendingView, ThreadList } from "./pending-view";
import { cn } from "@/lib/utils";

const FEATURE_LABELS: Record<string, { label: string; fmt: (v: number) => string; help: string }> = {
  Income: { label: "Annual income", fmt: (v) => formatINR(v), help: "As entered" },
  Age: { label: "Age", fmt: (v) => `${v} yrs`, help: "As entered" },
  Experience: { label: "Total experience", fmt: (v) => `${v} yrs`, help: "As entered" },
  CURRENT_JOB_YRS: { label: "Years in current job", fmt: (v) => `${v} yrs`, help: "As entered" },
  CURRENT_HOUSE_YRS: { label: "Years at residence", fmt: (v) => `${v} yrs`, help: "As entered" },
  Income_per_Experience: { label: "Income per year of experience", fmt: (v) => formatINR(v), help: "Income ÷ (experience + 1)" },
  Career_Stability: { label: "Career stability", fmt: (v) => `${v} yrs`, help: "Job years + residence years" },
  Experience_Ratio: { label: "Experience ratio", fmt: (v) => v.toFixed(3), help: "Experience ÷ age" },
  Financial_Maturity: { label: "Financial maturity", fmt: (v) => formatNumber(v), help: "Age × job years" },
  Long_Term_Resident: { label: "Long-term resident", fmt: (v) => (v ? "Yes" : "No"), help: "Residence ≥ 12 years" },
  Career_Start_Age: { label: "Career start age", fmt: (v) => `${v} yrs`, help: "Age − experience" },
  Stable_Employee: { label: "Stable employee", fmt: (v) => (v ? "Yes" : "No"), help: "Job ≥ 5 years" },
};

const BAND_STYLE: Record<RiskBand, string> = {
  Low: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  Moderate: "bg-amber-50 text-amber-800 ring-amber-200",
  High: "bg-rose-50 text-rose-800 ring-rose-200",
};

const TIPS = [
  "Build a longer track record with your current employer — job stability weighs heavily.",
  "Staying longer at your current residence signals stability.",
  "Growing your income relative to your experience improves your profile.",
  "Keep your existing credit obligations low and repay on time.",
];

function DecidedView({ result }: { result: DecidedResult }) {
  const [downloading, setDownloading] = useState(false);
  const [preview, setPreview] = useState<PreviewEmail | null>(null);
  const approved = result.decision === "APPROVED";
  const a = result.applicant;

  async function onDownload() {
    setDownloading(true);
    try {
      const { downloadDecisionLetter } = await import("@/lib/pdf-letter");
      await downloadDecisionLetter(result);
      toast.success("Decision letter downloaded");
    } catch {
      toast.error("Couldn’t generate the PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-6">
      {result.is_demo && (
        <div role="note" className="flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <FlaskConical className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>
            <strong>Provisional decision.</strong> The risk model was unavailable when this application was processed, so this
            result comes from a placeholder rule and is <strong>not</strong> a real model decision.
          </p>
        </div>
      )}
      {result.status === "Under Review" && (
        <div role="note" className="flex gap-3 rounded-md border border-brand-line bg-brand-soft p-4 text-sm text-brand-deep">
          <UserCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>A loan officer is reviewing this application. The decision below may be updated.</p>
        </div>
      )}
      {result.status === "Overridden" && (
        <div role="note" className="flex gap-3 rounded-md border border-brand-line bg-brand-soft p-4 text-sm text-brand-deep">
          <UserCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>The loan officer’s final decision differs from the risk model’s recommendation. Both are shown under “How this decision was made”.</p>
        </div>
      )}

      {/* Hero card */}
      <section
        aria-labelledby="decision-heading"
        className={cn(
          "overflow-hidden rounded-lg border border-t-4 border-stone-200 bg-white",
          approved ? "border-t-emerald-600" : "border-t-rose-600",
        )}
      >
        <div className="grid gap-8 p-6 md:grid-cols-[1fr_auto] md:p-10">
          <div>
            {approved ? (
              <svg viewBox="0 0 64 64" className="lw-pop size-16" aria-hidden>
                <circle cx="32" cy="32" r="30" fill="#059669" />
                <path d="M19 33l9 9 17-19" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" className="lw-draw" style={{ ["--len" as string]: 44 }} />
              </svg>
            ) : (
              <span className="lw-pop flex size-16 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                <XCircle className="size-9" aria-hidden />
              </span>
            )}
            <p className={cn("mt-6 inline-flex rounded px-2 py-0.5 text-xs font-semibold", approved ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")}>
              {approved ? "Approved" : "Not approved"}
            </p>
            <h1 id="decision-heading" className="mt-2 text-2xl font-semibold text-navy md:text-3xl">
              {approved ? `Congratulations, ${a.full_name.split(" ")[0]} — your loan application is approved` : "We’re unable to approve your application at this time"}
            </h1>
            <p className="mt-3 max-w-xl text-stone-600">
              {approved
                ? "Your application has been reviewed and approved by a loan officer. Here’s a summary of your loan and what happens next."
                : "Thank you for applying. After a review by a loan officer, we can’t approve this application right now. We know this isn’t the news you hoped for. Below are indicative factors and steps that can help."}
            </p>
            <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <div>
                <dt className="text-stone-500">Application ID</dt>
                <dd className="font-mono font-semibold text-navy">{result.application_id}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Decided on</dt>
                <dd className="font-semibold text-navy">{formatDate(result.timestamp, true)}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Risk band</dt>
                <dd>
                  <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1", BAND_STYLE[result.risk_band])}>
                    {result.risk_band} risk
                  </span>
                </dd>
              </div>
            </dl>
          </div>
          <div className="flex flex-col items-center justify-center rounded-lg bg-white p-6 ring-1 ring-stone-200 md:w-64">
            {approved ? (
              <Gauge value={result.approval_score} label="Approval score" tone="success" />
            ) : (
              <Gauge value={result.default_probability} label="Estimated default risk" tone={result.risk_band === "Moderate" ? "warning" : "danger"} />
            )}
            <p className="mt-3 text-center text-xs text-stone-500">Model confidence {formatPercent(result.confidence, 0)}</p>
          </div>
        </div>

        {approved && (
          <div className="grid gap-px border-t border-stone-200 bg-stone-200 sm:grid-cols-4">
            {[
              { k: "Approved amount", v: formatINR(a.loan_amount), sub: formatLakhCrore(a.loan_amount) },
              { k: "Tenure", v: `${a.tenure_months} months`, sub: formatTenure(a.tenure_months) },
              { k: "Indicative EMI", v: result.estimated_emi ? formatINR(Math.round(result.estimated_emi)) : "—", sub: "per month" },
              { k: "Indicative rate", v: `${result.interest_rate}% p.a.`, sub: "indicative" },
            ].map((x) => (
              <div key={x.k} className="bg-white p-5">
                <p className="text-xs text-stone-500">{x.k}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-navy">{x.v}</p>
                <p className="text-xs text-stone-500">{x.sub}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0 space-y-6">
          {approved ? (
            <section className="rounded-lg bg-white p-6 border border-stone-200" aria-labelledby="next-heading">
              <h2 id="next-heading" className="flex items-center gap-2 text-lg font-semibold text-navy">
                <FileCheck2 className="size-5 text-emerald-600" aria-hidden /> Next steps
              </h2>
              <ol className="mt-4 space-y-4">
                {[
                  { t: "Download your decision letter", d: "Keep it for your records — it includes your application ID and loan summary." },
                  { t: "Keep your KYC documents ready", d: "PAN, Aadhaar and address proof are typically required for verification." },
                  { t: "Income verification", d: "Recent salary slips, bank statements or ITRs may be requested." },
                  { t: "Review and sign", d: "Read the final agreement, interest rate and charges carefully before accepting." },
                ].map((s, i) => (
                  <li key={s.t} className="flex gap-4">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">{i + 1}</span>
                    <div>
                      <p className="font-medium text-stone-900">{s.t}</p>
                      <p className="text-sm text-stone-600">{s.d}</p>
                    </div>
                  </li>
                ))}
              </ol>
              {result.indicative_factors.length > 0 && (
                <div className="mt-6 border-t border-stone-100 pt-5">
                  <h3 className="text-sm font-semibold text-navy">Strengths in your profile</h3>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {result.indicative_factors.map((f) => (
                      <li key={f.key} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
                        <TrendingUp className="size-3.5" aria-hidden /> {f.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ) : (
            <>
              <section className="rounded-lg bg-white p-6 border border-stone-200" aria-labelledby="factors-heading">
                <h2 id="factors-heading" className="flex items-center gap-2 text-lg font-semibold text-navy">
                  <TrendingDown className="size-5 text-rose-600" aria-hidden /> Indicative factors
                </h2>
                <p className="mt-1 text-sm text-stone-600">
                  These compare your details with typical applicants in the training data. They are <strong>indicative factors, not exact model explanations</strong>.
                </p>
                <ul className="mt-4 space-y-3">
                  {result.indicative_factors.map((f) => (
                    <li key={f.key} className="flex gap-3 rounded-md bg-rose-50/60 p-4">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-600" aria-hidden />
                      <div className="min-w-0">
                        <p className="font-medium text-stone-900">{f.label}</p>
                        {f.detail && <p className="text-sm text-stone-600">{f.detail}</p>}
                        {f.value != null && f.median != null && FEATURE_LABELS[f.key] && (
                          <p className="mt-1 text-xs text-stone-500">
                            Yours: {FEATURE_LABELS[f.key].fmt(f.value)} · Typical: {FEATURE_LABELS[f.key].fmt(f.median)}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="rounded-lg bg-white p-6 border border-stone-200" aria-labelledby="tips-heading">
                <h2 id="tips-heading" className="flex items-center gap-2 text-lg font-semibold text-navy">
                  <Lightbulb className="size-5 text-amber-500" aria-hidden /> Tips to improve your eligibility
                </h2>
                <ul className="mt-4 space-y-3">
                  {TIPS.map((t) => (
                    <li key={t} className="flex gap-3 text-sm text-stone-700">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
                      {t}
                    </li>
                  ))}
                </ul>
                <p className="mt-5 flex items-center gap-2 rounded-md bg-stone-50 p-4 text-sm text-stone-700">
                  <CalendarClock className="size-5 shrink-0 text-brand" aria-hidden />
                  You’re welcome to reapply after 90 days, once your circumstances have had time to change.
                </p>
              </section>
            </>
          )}

          {result.messages.length > 0 && (
            <section className="rounded-lg border border-stone-200 bg-white p-6" aria-labelledby="thread-heading">
              <h2 id="thread-heading" className="text-lg font-semibold text-navy">Messages with the loan officer</h2>
              <div className="mt-4">
                <ThreadList messages={result.messages} />
              </div>
            </section>
          )}

          <Accordion className="rounded-lg bg-white px-6 border border-stone-200">
            <AccordionItem value="how">
              <AccordionTrigger className="py-5 text-base font-semibold text-navy">How this decision was made</AccordionTrigger>
              <AccordionContent className="space-y-5 pb-6 text-sm text-stone-700">
                <ol className="grid gap-2 sm:grid-cols-3">
                  {[
                    "Your 11 profile inputs",
                    "Feature engineering (7 derived features)",
                    "One-hot encoding → 414 features",
                    "Standard scaling (numeric features)",
                    "Random Forest (100 trees)",
                    "Model recommendation, then a loan officer’s final decision",
                  ].map((s, i) => (
                    <li key={s} className="rounded-lg bg-stone-50 p-3">
                      <span className="text-xs font-semibold text-brand">Step {i + 1}</span>
                      <p className="mt-0.5 text-stone-800">{s}</p>
                    </li>
                  ))}
                </ol>
                <div className="relative overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Engineered features used by the model</caption>
                    <thead>
                      <tr className="border-b border-stone-200 text-xs text-stone-500">
                        <th scope="col" className="py-2 pr-4 font-medium">Feature</th>
                        <th scope="col" className="py-2 pr-4 font-medium">Value</th>
                        <th scope="col" className="py-2 font-medium">How it’s derived</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(result.engineered_features).map(([k, v]) => {
                        const meta = FEATURE_LABELS[k];
                        return (
                          <tr key={k} className="border-b border-stone-100 last:border-0">
                            <th scope="row" className="py-2 pr-4 font-medium text-stone-800">{meta?.label ?? k.replace(/_/g, " ")}</th>
                            <td className="py-2 pr-4 tabular-nums">{meta && typeof v === "number" ? meta.fmt(v) : String(v)}</td>
                            <td className="py-2 text-stone-500">{meta?.help ?? "Age bracket"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <dl className="grid gap-3 rounded-md bg-stone-50 p-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-stone-500">Model prediction (risk class)</dt>
                    <dd className="font-medium">{result.risk_class} — {result.risk_class === 0 ? "low risk" : "high risk"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-stone-500">Model recommendation</dt>
                    <dd className="font-medium">{result.model_decision === "APPROVED" ? "Approve" : "Decline"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-stone-500">Final decision</dt>
                    <dd className="font-medium">{result.decision === "APPROVED" ? "Approved" : "Declined"} by a loan officer</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-stone-500">Default probability</dt>
                    <dd className="font-medium tabular-nums">{formatPercent(result.default_probability)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-stone-500">Model version</dt>
                    <dd className="font-mono text-xs">{result.model_version}</dd>
                  </div>
                </dl>
                <p className="text-stone-600">
                  Loan amount, tenure and purpose are <strong>not</strong> model inputs — the decision reflects your applicant profile risk only. Risk band:
                  Low &lt; 30%, Moderate 30–50%, High ≥ 50% default probability (display only; the decision comes from the model’s class prediction).
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <aside className="min-w-0 space-y-6">
          <ApplicantSummaryCard result={result} />

          <EmailsPanel result={result} onPreview={setPreview} />

          {result.warnings.length > 0 && (
            <section className="rounded-lg border border-amber-200 bg-amber-50 p-5" aria-labelledby="warn-heading">
              <h2 id="warn-heading" className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <AlertTriangle className="size-4" aria-hidden /> Notes on this assessment
              </h2>
              <ul className="mt-3 space-y-2 text-sm text-amber-900">
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </section>
          )}

          <div className="no-print flex flex-col gap-2">
            <Button variant="brand" size="lg" onClick={onDownload} disabled={downloading}>
              {downloading ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />} Download PDF decision letter
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="lg" onClick={() => window.print()}>
                <Printer aria-hidden /> Print
              </Button>
              <ButtonLink href="/apply" variant="outline" size="lg">
                <Plus aria-hidden /> New application
              </ButtonLink>
            </div>
          </div>
          <p className="flex items-center gap-2 text-xs text-stone-500">
            <ShieldCheck className="size-4 text-emerald-600" aria-hidden /> Save your application ID to check your status later.
          </p>
        </aside>
      </div>

      <Disclaimer />
      <EmailPreview email={preview} onClose={() => setPreview(null)} internal={false} />
    </div>
  );
}

function ApplicantSummaryCard({ result }: { result: ApplicationResult }) {
  const a = result.applicant;
  return (
    <section className="rounded-lg bg-white p-6 border border-stone-200" aria-labelledby="summary-heading">
            <h2 id="summary-heading" className="text-lg font-semibold text-navy">Applicant summary</h2>
            <dl className="mt-4 divide-y divide-stone-100 text-sm">
              {[
                ["Name", a.full_name],
                ["Email", a.email],
                ["Mobile", `${a.phone_masked}${result.phone_verified ? " · verified" : ""}`],
                ["Age", `${a.age} yrs`],
                ["Marital status", a.marital_status],
                ["Profession", a.profession],
                ["Experience", `${a.experience} yrs (${a.current_job_years} in current job)`],
                ["Annual income", formatINR(a.income)],
                ["Location", `${a.city}, ${a.state}`],
                ["House", `${a.house_ownership} · ${a.current_house_years} yrs`],
                ["Car ownership", a.car_ownership],
                ["Loan", `${formatINR(a.loan_amount)} · ${a.tenure_months} mo`],
                ["Purpose", a.purpose],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2.5">
                  <dt className="text-stone-500">{k}</dt>
                  <dd className="min-w-0 break-words text-right font-medium text-stone-900">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
  );
}

function EmailsPanel({ result, onPreview }: { result: ApplicationResult; onPreview: (p: PreviewEmail) => void }) {
  if (result.emails.length === 0) return null;
  return (
<section className="rounded-lg border border-stone-200 bg-white p-6" aria-labelledby="emails-heading">
              <h2 id="emails-heading" className="text-lg font-semibold text-navy">Your messages</h2>
              <ul className="mt-3 divide-y divide-stone-100">
                {result.emails.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-stone-900">{e.subject}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                        {e.to_masked} <EmailStatusBadge status={e.status} hideUnsent />
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onPreview({ subject: e.subject, to: e.to_masked, created_at: e.created_at, status: e.status, html: e.html })}
                    >
                      View
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
  );
}

export function DecisionView({
  result,
  lookupEmail,
  onRefresh,
}: {
  result: ApplicationResult;
  lookupEmail?: string;
  onRefresh?: () => void;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<PreviewEmail | null>(null);
  if (result.decision !== "PENDING") return <DecidedView result={result as DecidedResult} />;
  return (
    <div className="space-y-6">
      <PendingView result={result} lookupEmail={lookupEmail} onRefresh={onRefresh ?? (() => router.refresh())} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <ApplicantSummaryCard result={result} />
        </div>
        <div className="min-w-0 space-y-6">
          <EmailsPanel result={result} onPreview={setPreview} />
          <p className="flex items-center gap-2 text-xs text-stone-500">
            <ShieldCheck className="size-4 text-emerald-600" aria-hidden /> Save your application ID to check your status later.
          </p>
        </div>
      </div>
      <Disclaimer />
      <EmailPreview email={preview} onClose={() => setPreview(null)} internal={false} />
    </div>
  );
}
