"use client";

import dynamic from "next/dynamic";

// Toasts are never needed for first paint; load sonner after hydration.
const Toaster = dynamic(() => import("@/components/ui/sonner").then((m) => m.Toaster), { ssr: false });

export function LazyToaster() {
  return <Toaster position="top-center" richColors closeButton />;
}
