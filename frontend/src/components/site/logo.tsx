import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8", className)}>
      <rect width="32" height="32" rx="6" fill="#1C1917" />
      <path d="M9 8v16h9" stroke="#fff" strokeWidth="3" strokeLinecap="square" fill="none" />
      <path d="M16 17l3.2 3.2L25 12" stroke="#D4A43A" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" fill="none" />
    </svg>
  );
}

export function Logo({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2.5 rounded", className)} aria-label="LendWise home">
      <LogoMark />
      <span className={cn("text-[1.2rem] font-semibold tracking-tight", light ? "text-white" : "text-navy")}>LendWise</span>
    </Link>
  );
}
