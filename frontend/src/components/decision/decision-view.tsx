"use client";

import { useState } from "react";
import { Check, CheckCircle2, Clock3, MessageSquareText, Printer, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/site/button-link";
import { Disclaimer } from "@/components/site/disclaimer";
import { EmailPreview, EmailStatusBadge, type PreviewEmail } from "@/components/site/email-preview";
import { ScreeningResult } from "@/components/screen/screen-result";
import { formatDate, formatUSD } from "@/lib/format";
import type { ApplicationResult } from "@/lib/types";
import { ReplyForm, ThreadList } from "./thread";
import { cn } from "@/lib/utils";

const EMAIL_KIND: Record<string, string> = {
  application_received: "Application received",
  decision: "Decision",
  decision_update: "Decision update",
  info_requested: "Information requested",
};

function header(result: ApplicationResult) {
  const first = result.applicant.full_name.split(" ")[0];
  if (result.decision === "APPROVED") {
    const lower = result.approved_amount !== null && result.approved_amount < result.applicant.loan_amount;
    return {
      tone: "border-t-emerald-600",
      badge: ["Approved", "bg-emerald-50 text-emerald-800"],
      icon: <CheckCircle2 className="size-9 text-emerald-600" aria-hidden />,
      title: lower
        ? `${first}, your application is approved for ${formatUSD(result.approved_amount!)}`
        : `${first}, your application is approved`,
      text: lower
        ? `A loan officer approved the counter-offer: a smaller amount than the ${formatUSD(result.applicant.loan_amount)} you asked for, which the screening rules accept.`
        : "A loan officer reviewed the screening result and approved your application.",
    };
  }
  if (result.decision === "REJECTED") {
    return {
      tone: "border-t-rose-600",
      badge: ["Not approved", "bg-rose-50 text-rose-800"],
      icon: <XCircle className="size-9 text-rose-600" aria-hidden />,
      title: "We are unable to approve your application at this time",
      text: "A loan officer reviewed the screening result and could not approve this application. A smaller amount, a higher FICO score or a lower DTI all improve the result.",
    };
  }
  const info = result.status === "Info Requested";
  return {
    tone: "border-t-gold",
    badge: [info ? "More information needed" : "With a loan officer", "bg-brand-soft text-brand-deep"],
    icon: info ? <MessageSquareText className="size-8 text-brand" aria-hidden /> : <Clock3 className="size-8 text-brand" aria-hidden />,
    title: info ? `${first}, the loan officer needs a little more information` : `Thanks, ${first}. Your application is with a loan officer`,
    text: info
      ? "Please answer the question below. Your application continues as soon as you reply."
      : "LendWise has screened your application. A loan officer now reviews the result and makes the final decision. We will email you, and you can check this page any time.",
  };
}

export function DecisionView({ result, lookupEmail, onRefresh }: { result: ApplicationResult; lookupEmail?: string; onRefresh?: () => void }) {
  const [preview, setPreview] = useState<PreviewEmail | null>(null);
  const h = header(result);
  const pending = result.decision === "PENDING";
  const needsInfo = result.status === "Info Requested";
  const steps = [
    { label: "Application submitted", state: "done" },
    { label: "Screened by LendWise", state: "done" },
    { label: needsInfo ? "Waiting for your reply" : "Loan officer review", state: pending ? "current" : "done" },
    { label: "Final decision", state: pending ? "todo" : "done" },
  ] as const;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section aria-labelledby="decision-heading" className={cn("overflow-hidden rounded-lg border border-t-4 border-stone-200 bg-white", h.tone)}>
        <div className="grid gap-8 p-6 md:grid-cols-[1fr_16rem] md:p-10">
          <div>
            {h.icon}
            <p className={cn("mt-5 inline-flex rounded px-2 py-0.5 text-xs font-semibold", h.badge[1])}>{h.badge[0]}</p>
            <h1 id="decision-heading" className="mt-2 text-2xl font-semibold text-navy md:text-3xl">{h.title}</h1>
            <p className="mt-3 max-w-xl text-stone-600">{h.text}</p>
            <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <div>
                <dt className="text-stone-500">Application ID</dt>
                <dd className="font-mono font-semibold text-navy">{result.application_id}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Submitted</dt>
                <dd className="font-semibold text-navy">{formatDate(result.timestamp, true)}</dd>
              </div>
              {result.decided_at && (
                <div>
                  <dt className="text-stone-500">Decided</dt>
                  <dd className="font-semibold text-navy">{formatDate(result.decided_at, true)}</dd>
                </div>
              )}
            </dl>
          </div>
          <ol className="space-y-4 self-center rounded-md border border-stone-200 p-5" aria-label="Application progress">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-3 text-sm">
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs",
                    s.state === "done" && "border-emerald-600 bg-emerald-600 text-white",
                    s.state === "current" && "border-gold bg-brand-soft text-brand",
                    s.state === "todo" && "border-stone-300 text-stone-400",
                  )}
                >
                  {s.state === "done" ? <Check className="size-4" aria-hidden /> : s.state === "current" ? <Clock3 className="size-3.5" aria-hidden /> : null}
                </span>
                <span className={cn(s.state === "todo" ? "text-stone-500" : "font-medium text-stone-900")}>
                  {s.label}
                  <span className="sr-only">{s.state === "done" ? " (done)" : s.state === "current" ? " (in progress)" : ""}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        {(needsInfo || result.messages.length > 0) && (
          <div className="border-t border-stone-200 p-6 md:px-10">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-navy">
              <MessageSquareText className="size-5 text-brand" aria-hidden /> Messages with the loan officer
            </h2>
            <div className="mt-4">
              <ThreadList messages={result.messages} />
            </div>
            {needsInfo && <ReplyForm applicationId={result.application_id} email={lookupEmail} onSent={() => (onRefresh ? onRefresh() : window.location.reload())} />}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="screening-heading" className="rounded-lg border border-stone-200 bg-stone-50 p-5 md:p-6">
          <h2 id="screening-heading" className="text-lg font-semibold text-navy">Screening result</h2>
          <p className="mt-1 mb-4 text-sm text-stone-600">
            This is what LendWise recommended when you applied. It helps the loan officer; it is not the final decision.
          </p>
          <ScreeningResult result={result.screening} />
        </section>

        <aside className="space-y-6">
          <section className="rounded-lg border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-navy">Your application</h2>
            <dl className="mt-3 divide-y divide-stone-100 text-sm">
              {[
                ["Name", result.applicant.full_name],
                ["Email", result.applicant.email],
                ["Purpose", result.applicant.purpose],
                ["Loan amount", formatUSD(result.applicant.loan_amount)],
                ["FICO score", String(result.applicant.fico)],
                ["DTI", `${result.applicant.dti}%`],
                ...(result.approved_amount !== null ? [["Approved amount", formatUSD(result.approved_amount)]] : []),
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2">
                  <dt className="text-stone-500">{k}</dt>
                  <dd className="break-all text-right font-medium text-stone-900">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          {result.emails.length > 0 && (
            <section className="rounded-lg border border-stone-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-navy">Emails we sent you</h2>
              <ul className="mt-2 divide-y divide-stone-100 text-sm">
                {result.emails.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-stone-900">{EMAIL_KIND[e.kind] ?? e.subject}</span>
                      <span className="flex items-center gap-2 text-xs text-stone-500">
                        {formatDate(e.created_at, true)} <EmailStatusBadge status={e.status} />
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPreview({ subject: e.subject, to: e.to_masked, created_at: e.created_at, status: e.status, html: e.html })}
                    >
                      View
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="no-print flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer aria-hidden /> Print
            </Button>
            <ButtonLink href="/screen" variant="outline">
              Screen another
            </ButtonLink>
          </div>
        </aside>
      </div>

      <Disclaimer />
      <EmailPreview email={preview} onClose={() => setPreview(null)} internal={false} />
    </div>
  );
}
