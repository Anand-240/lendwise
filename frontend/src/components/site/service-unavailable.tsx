"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RefreshCw, ServerCrash } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ServiceUnavailable({ message }: { message?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div role="alert" className="mx-auto max-w-lg rounded-lg bg-white p-8 text-center border border-stone-200">
      <span className="mx-auto flex size-14 items-center justify-center rounded-lg bg-rose-50 text-danger">
        <ServerCrash className="size-7" aria-hidden />
      </span>
      <h2 className="mt-6 text-xl font-semibold text-navy">Service temporarily unavailable</h2>
      <p className="mt-2 text-sm text-stone-600">
        {message ?? "We can’t reach the decision service right now. Your information hasn’t been submitted. Please try again in a few minutes."}
      </p>
      <Button className="mt-6" onClick={() => start(() => router.refresh())} disabled={pending}>
        <RefreshCw className={pending ? "animate-spin" : undefined} aria-hidden /> Try again
      </Button>
    </div>
  );
}
