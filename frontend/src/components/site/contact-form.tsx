"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "@/lib/zod";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.email("Enter a valid email"),
  topic: z.enum(["Application", "Decision", "Privacy", "Other"]),
  application_id: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^LW-\d{4}-\d{6}$/.test(v), "Use the format LW-2026-000123, or leave blank"),
  message: z.string().trim().min(10, "Please write at least 10 characters").max(2000),
});
type Values = z.infer<typeof schema>;

export function ContactForm() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { topic: "Application", application_id: "" } });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, application_id: values.application_id || null }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(res.status === 503 ? "Service temporarily unavailable" : "Couldn’t send your message", {
          description: body?.error?.message ?? "Please try again.",
        });
        return;
      }
      toast.success("Message sent", {
        description: `Reference: ${body.reference}. We’ve emailed a confirmation to ${values.email}.`,
      });
      reset({ name: "", email: "", topic: "Application", application_id: "", message: "" });
    } catch {
      toast.error("Service temporarily unavailable", { description: "Please try again in a few minutes." });
    }
  });

  const fieldErr = (id: string, msg?: string) =>
    msg ? (
      <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger">
        {msg}
      </p>
    ) : null;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5 rounded-lg bg-white p-6 border border-stone-200 md:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="c-name" className="text-sm font-medium text-stone-800">Name</label>
          <Input id="c-name" autoComplete="name" aria-invalid={!!errors.name || undefined} aria-describedby={errors.name ? "c-name-error" : undefined} {...register("name")} />
          {fieldErr("c-name", errors.name?.message)}
        </div>
        <div className="space-y-2">
          <label htmlFor="c-email" className="text-sm font-medium text-stone-800">Email</label>
          <Input id="c-email" type="email" autoComplete="email" aria-invalid={!!errors.email || undefined} aria-describedby={errors.email ? "c-email-error" : undefined} {...register("email")} />
          {fieldErr("c-email", errors.email?.message)}
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
      <div className="space-y-2">
        <label htmlFor="c-topic" className="text-sm font-medium text-stone-800">Topic</label>
        <select id="c-topic" className="h-11 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40" {...register("topic")}>
          <option>Application</option>
          <option>Decision</option>
          <option>Privacy</option>
          <option>Other</option>
        </select>
      </div>
      <div className="space-y-2">
        <label htmlFor="c-app" className="text-sm font-medium text-stone-800">
          Application ID <span className="font-normal text-stone-500">(optional)</span>
        </label>
        <Input
          id="c-app"
          placeholder="LW-2026-000123"
          className="font-mono uppercase"
          aria-invalid={!!errors.application_id || undefined}
          aria-describedby={errors.application_id ? "c-app-error" : undefined}
          {...register("application_id")}
        />
        {fieldErr("c-app", errors.application_id?.message)}
      </div>
      </div>
      <div className="space-y-2">
        <label htmlFor="c-message" className="text-sm font-medium text-stone-800">Message</label>
        <Textarea id="c-message" rows={6} aria-invalid={!!errors.message || undefined} aria-describedby={errors.message ? "c-message-error" : undefined} {...register("message")} />
        {fieldErr("c-message", errors.message?.message)}
      </div>
      <Button type="submit" variant="brand" size="lg" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} Send message
      </Button>
    </form>
  );
}
