"use client";

import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const fieldIds = (name: string) => ({
  input: `f-${name}`,
  hint: `f-${name}-hint`,
  error: `f-${name}-error`,
  label: `f-${name}-label`,
});

export function describedBy(name: string, hint?: boolean, error?: boolean) {
  const ids = fieldIds(name);
  return [hint && ids.hint, error && ids.error].filter(Boolean).join(" ") || undefined;
}

/** Label + tooltip + hint + error wrapper. The control must use fieldIds(name).input as its id. */
export function Field({
  name,
  label,
  tooltip,
  hint,
  error,
  children,
  className,
}: {
  name: string;
  label: string;
  tooltip?: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ids = fieldIds(name);
  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <div className="flex items-center gap-1.5">
        <label id={ids.label} htmlFor={ids.input} className="text-sm font-medium text-stone-800">
          {label}
        </label>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger
              type="button"
              aria-label={`About ${label}`}
              className="inline-flex size-6 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-navy"
            >
              <Info className="size-3.5" aria-hidden />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 text-left leading-relaxed">{tooltip}</TooltipContent>
          </Tooltip>
        )}
      </div>
      {children}
      {hint && !error && (
        <p id={ids.hint} className="text-xs text-stone-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={ids.error} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Text input with an optional "$" prefix or "%" suffix. Keeps exactly what the user typed, so
 *  the server-side validator (report Table A.1) decides what is valid. */
export function AdornedInput({
  name,
  value,
  onChange,
  prefix,
  suffix,
  invalid,
  hint,
  placeholder,
  inputMode = "decimal",
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  invalid?: boolean;
  hint?: boolean;
  placeholder?: string;
  inputMode?: "decimal" | "numeric";
}) {
  const ids = fieldIds(name);
  return (
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-stone-500" aria-hidden>
          {prefix}
        </span>
      )}
      <input
        id={ids.input}
        name={name}
        inputMode={inputMode}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy(name, hint, invalid)}
        className={cn(
          "h-11 w-full rounded-lg border border-input bg-white text-base tabular-nums outline-none transition-colors placeholder:text-stone-400 hover:border-stone-400 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-danger aria-invalid:ring-3 aria-invalid:ring-danger/15 md:text-sm",
          prefix ? "pl-7" : "pl-3",
          suffix ? "pr-8" : "pr-3",
        )}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-stone-500" aria-hidden>
          {suffix}
        </span>
      )}
    </div>
  );
}
