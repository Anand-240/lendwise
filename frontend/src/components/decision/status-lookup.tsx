"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "@/lib/zod";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";
import type { ApplicationResult } from "@/lib/types";

// The full decision view is only needed after a successful lookup.
const DecisionView = dynamic(() => import("./decision-view").then((m) => m.DecisionView), {
  loading: () => <Skeleton className="h-96 w-full rounded-lg" />,
});

const schema = z.object({
  id: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^LW-\d{4}-\d{6}$/, "Enter an ID like LW-2026-000123"),
  email: z.email("Enter the email you applied with"),
});
type Values = z.infer<typeof schema>;

export function StatusLookup({ defaultId, intro }: { defaultId?: string; intro?: React.ReactNode }) {
  const [result, setResult] = useState<ApplicationResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { id: defaultId ?? "", email: "" } });

  const onSubmit = handleSubmit(async ({ id, email }) => {
    setNotFound(false);
    setResult(null);
    try {
      const res = await fetch(`/api/status?id=${encodeURIComponent(id)}&email=${encodeURIComponent(email)}`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (res.ok) return setResult(body);
      if (res.status === 404) return setNotFound(true);
      toast.error(res.status === 503 ? "Service temporarily unavailable" : "Couldn’t check status", { description: body?.error?.message });
    } catch {
      toast.error("Service temporarily unavailable", { description: "Please try again in a few minutes." });
    }
  });

  return (
    <div className="space-y-8">
      <form onSubmit={onSubmit} noValidate className="no-print rounded-lg bg-white p-6 border border-stone-200 md:p-8">
        {intro}
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-start">
          <div className="space-y-2">
            <label htmlFor="status-id" className="text-sm font-medium text-stone-800">Application ID</label>
            <Input
              id="status-id"
              placeholder="LW-2026-000123"
              autoComplete="off"
              className="font-mono uppercase"
              aria-invalid={!!errors.id || undefined}
              aria-describedby={errors.id ? "status-id-error" : undefined}
              {...register("id")}
            />
            {errors.id && <p id="status-id-error" role="alert" className="text-xs font-medium text-danger">{errors.id.message}</p>}
          </div>
          <div className="space-y-2">
            <label htmlFor="status-email" className="text-sm font-medium text-stone-800">Email address</label>
            <Input
              id="status-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              aria-invalid={!!errors.email || undefined}
              aria-describedby={errors.email ? "status-email-error" : undefined}
              {...register("email")}
            />
            {errors.email && <p id="status-email-error" role="alert" className="text-xs font-medium text-danger">{errors.email.message}</p>}
          </div>
          <Button type="submit" variant="brand" size="lg" disabled={isSubmitting} className="md:mt-7">
            {isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />} Check status
          </Button>
        </div>
        {notFound && (
          <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
            We couldn’t find an application matching that ID and email. Please check both and try again.
          </p>
        )}
      </form>
      <div aria-live="polite">
        {isSubmitting && (
          <div className="space-y-4" aria-label="Loading">
            <Skeleton className="h-56 w-full rounded-lg" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        )}
        {result && <DecisionView result={result} />}
      </div>
    </div>
  );
}
