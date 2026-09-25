"use client";

import { useState } from "react";
import { Check, Clock3, Loader2, MessageSquareText, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import type { ApplicationResult, ThreadMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ThreadList({ messages }: { messages: ThreadMessage[] }) {
  return (
    <ol className="space-y-3">
      {messages.map((m, i) => (
        <li
          key={i}
          className={cn(
            "rounded-md border p-4 text-sm",
            m.author === "officer" ? "border-brand-line bg-brand-soft" : "ml-6 border-stone-200 bg-white",
          )}
        >
          <p className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
            <span className="font-semibold text-stone-800">{m.author === "officer" ? "Loan officer" : "You"}</span>
            <span aria-hidden>·</span>
            {formatDate(m.created_at, true)}
          </p>
          <p className="mt-1.5 whitespace-pre-wrap break-words text-stone-800">{m.body}</p>
        </li>
      ))}
    </ol>
  );
}

function ReplyForm({ applicationId, email, onSent }: { applicationId: string; email?: string; onSent: () => void }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), email }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error("Couldn’t send your reply", { description: body?.error?.details?.[0]?.message ?? body?.error?.message });
        return;
      }
      toast.success("Reply sent", { description: "Your application is back with the loan officer." });
      setText("");
      onSent();
    } catch {
      toast.error("Service temporarily unavailable", { description: "Please try again in a few minutes." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-4">
      <label htmlFor="applicant-reply" className="text-sm font-medium text-stone-800">
        Your reply
      </label>
      <Textarea
        id="applicant-reply"
        rows={4}
        maxLength={2000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write your answer for the loan officer…"
        className="mt-1 bg-white"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-stone-500">{text.trim().length}/2000</p>
        <Button variant="brand" onClick={send} disabled={text.trim().length < 5 || sending}>
          {sending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} Send reply
        </Button>
      </div>
    </div>
  );
}

/** Shown while a loan officer reviews the application. The model's assessment is not revealed yet. */
export function PendingView({
  result,
  lookupEmail,
  onRefresh,
}: {
  result: ApplicationResult;
  lookupEmail?: string;
  onRefresh: () => void;
}) {
  const needsInfo = result.status === "Info Requested";
  const steps = [
    { label: "Application submitted", state: "done" as const },
    { label: "Risk assessment completed", state: "done" as const },
    { label: needsInfo ? "Waiting for your reply" : "Loan officer review", state: "current" as const },
    { label: "Final decision", state: "todo" as const },
  ];

  return (
    <section
      aria-labelledby="decision-heading"
      className="overflow-hidden rounded-lg border border-t-4 border-stone-200 border-t-gold bg-white"
    >
      <div className="grid gap-8 p-6 md:grid-cols-[1fr_17rem] md:p-10">
        <div>
          <span className="flex size-16 items-center justify-center rounded-full bg-brand-soft text-brand">
            <Clock3 className="size-8" aria-hidden />
          </span>
          <p className="mt-6 inline-flex rounded bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-deep">
            {needsInfo ? "More information needed" : "Under review"}
          </p>
          <h1 id="decision-heading" className="mt-2 text-2xl font-semibold text-navy md:text-3xl">
            {needsInfo
              ? `${result.applicant.full_name.split(" ")[0]}, the loan officer needs a little more information`
              : `Thanks, ${result.applicant.full_name.split(" ")[0]}. Your application is with a loan officer`}
          </h1>
          <p className="mt-3 max-w-xl text-stone-600">
            {needsInfo
              ? "Please answer the question below. Your application continues as soon as you reply."
              : "Our risk model has assessed your application. A loan officer now reviews it and makes the final decision. We’ll email you as soon as it’s decided, and you can check this page any time."}
          </p>
          <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm">
            <div>
              <dt className="text-stone-500">Application ID</dt>
              <dd className="font-mono font-semibold text-navy">{result.application_id}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Submitted on</dt>
              <dd className="font-semibold text-navy">{formatDate(result.timestamp, true)}</dd>
            </div>
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
          {needsInfo && <ReplyForm applicationId={result.application_id} email={lookupEmail} onSent={onRefresh} />}
        </div>
      )}
    </section>
  );
}
