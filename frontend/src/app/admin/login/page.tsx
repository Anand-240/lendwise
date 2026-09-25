import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/admin/login-form";
import { Logo } from "@/components/site/logo";

export const metadata: Metadata = {
  title: "Officer login",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-stone-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-lg bg-white p-8 border border-stone-200">
          <h1 className="text-2xl font-semibold text-navy">Loan officer sign in</h1>
          <p className="mt-1 text-sm text-stone-600">Access the applications dashboard.</p>
          <Suspense fallback={<div className="mt-6 h-56" />}>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-xs text-stone-500">Authorised personnel only. Sessions expire automatically.</p>
      </div>
    </div>
  );
}
