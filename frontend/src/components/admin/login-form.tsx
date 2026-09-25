"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "@/lib/zod";
import { Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const schema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});
type Values = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (res.ok) {
        toast.dismiss();
        const next = params.get("next");
        router.replace(next && next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin");
        router.refresh();
        return;
      }
      const body = await res.json().catch(() => null);
      toast.error(res.status === 401 ? "Invalid email or password" : res.status === 503 ? "Service temporarily unavailable" : "Sign in failed", {
        description: res.status === 401 ? undefined : body?.error?.message,
      });
    } catch {
      toast.error("Service temporarily unavailable");
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 space-y-5">
      <div className="space-y-2">
        <label htmlFor="admin-email" className="text-sm font-medium text-stone-800">Email</label>
        <Input
          id="admin-email"
          type="email"
          autoComplete="username"
          aria-invalid={!!errors.email || undefined}
          aria-describedby={errors.email ? "admin-email-error" : undefined}
          {...register("email")}
        />
        {errors.email && <p id="admin-email-error" role="alert" className="text-xs font-medium text-danger">{errors.email.message}</p>}
      </div>
      <div className="space-y-2">
        <label htmlFor="admin-password" className="text-sm font-medium text-stone-800">Password</label>
        <Input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.password || undefined}
          aria-describedby={errors.password ? "admin-password-error" : undefined}
          {...register("password")}
        />
        {errors.password && <p id="admin-password-error" role="alert" className="text-xs font-medium text-danger">{errors.password.message}</p>}
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : <LogIn aria-hidden />} Sign in
      </Button>
    </form>
  );
}
