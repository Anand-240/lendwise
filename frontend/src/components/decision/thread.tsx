"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import type { ThreadMessage } from "@/lib/types";
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

export function ReplyForm({ applicationId, email, onSent }: { applicationId: string; email?: string; onSent: () => void }) {
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
        toast.error("Could not send your reply", { description: body?.error?.details?.[0]?.message ?? body?.error?.message });
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
        placeholder="Write your answer for the loan officer"
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
