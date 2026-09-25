import { Info } from "lucide-react";
import { DISCLAIMER } from "@/lib/site";
import { cn } from "@/lib/utils";

export function Disclaimer({ className }: { className?: string }) {
  return (
    <p className={cn("flex gap-2 rounded-md border border-stone-200 bg-stone-50 p-4 text-xs leading-relaxed text-stone-600", className)}>
      <Info className="mt-0.5 size-4 shrink-0 text-stone-500" aria-hidden />
      <span>{DISCLAIMER}</span>
    </p>
  );
}
