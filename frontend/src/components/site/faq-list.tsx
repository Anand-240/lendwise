import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Zero-JS disclosure list (native <details>), keyboard and screen-reader friendly. */
export function FaqList({ items, className }: { items: { q: string; a: string }[]; className?: string }) {
  return (
    <div className={cn("divide-y divide-stone-200 border-y border-stone-200", className)}>
      {items.map((f) => (
        <details key={f.q} className="group py-1">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded py-4 text-base font-medium text-navy hover:text-brand [&::-webkit-details-marker]:hidden">
            {f.q}
            <Plus className="size-4 shrink-0 text-stone-500 transition-transform group-open:rotate-45" aria-hidden />
          </summary>
          <p className="max-w-3xl pb-5 text-sm leading-relaxed text-stone-600">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
