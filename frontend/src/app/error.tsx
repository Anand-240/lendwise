"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/site/button-link";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface for monitoring without leaking details to the UI.
    console.warn("Page error", error.digest);
  }, [error]);
  return (
    <section className="container-page flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <span className="flex size-14 items-center justify-center rounded-lg bg-rose-50 text-danger">
        <TriangleAlert className="size-7" aria-hidden />
      </span>
      <h1 className="mt-6 text-3xl font-semibold text-navy">Something went wrong</h1>
      <p className="mt-3 max-w-md text-stone-600">
        An unexpected error occurred. Please try again. If the problem continues, the service may be temporarily unavailable.
      </p>
      {error.digest && <p className="mt-2 text-xs text-stone-500">Reference: {error.digest}</p>}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/" variant="outline">Go home</ButtonLink>
      </div>
    </section>
  );
}
