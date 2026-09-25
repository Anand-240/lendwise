"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PreviewEmail = { subject: string; to: string; created_at: string; status: string; html: string; error?: string | null };

export function EmailStatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    demo: ["Demo — not delivered", "bg-amber-50 text-amber-900 ring-amber-200"],
    queued: ["Sending", "bg-stone-100 text-stone-700 ring-stone-200"],
    sent: ["Delivered to provider", "bg-emerald-50 text-emerald-800 ring-emerald-200"],
    failed: ["Failed", "bg-rose-50 text-rose-800 ring-rose-200"],
  };
  const [label, cls] = map[status] ?? [status, "bg-stone-100 text-stone-700 ring-stone-200"];
  return <span className={cn("inline-flex whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ring-1", cls)}>{label}</span>;
}

/** Shows an email exactly as the recipient would see it, in a sandboxed iframe (no scripts). */
export function EmailPreview({ email, onClose }: { email: PreviewEmail | null; onClose: () => void }) {
  return (
    <Dialog open={!!email} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-2rem)] max-w-2xl overflow-hidden p-0 sm:max-w-2xl">
        {email && (
          <>
            <DialogHeader className="border-b border-stone-200 px-5 py-4 text-left">
              <DialogTitle className="pr-8 text-base">{email.subject}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2 text-xs">
                <span>To {email.to}</span>
                <span aria-hidden>·</span>
                <span>{formatDate(email.created_at, true)}</span>
                <EmailStatusBadge status={email.status} />
              </DialogDescription>
              {email.status === "demo" && (
                <p className="mt-2 text-xs text-amber-900">
                  Demo mode: this email was captured, not sent. Add a <code className="font-mono">RESEND_API_KEY</code> to deliver emails.
                </p>
              )}
              {email.error && <p className="mt-2 text-xs text-danger">Delivery error: {email.error}</p>}
            </DialogHeader>
            <iframe
              title={`Email: ${email.subject}`}
              sandbox=""
              srcDoc={email.html}
              className="h-[65dvh] w-full bg-stone-50"
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
