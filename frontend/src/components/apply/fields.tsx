"use client";

import { useState } from "react";
import { ChevronsUpDown, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import dynamic from "next/dynamic";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Option } from "@/lib/types";

// The searchable list (cmdk) loads the first time any dropdown opens.
const ComboboxList = dynamic(() => import("./combobox-list").then((m) => m.ComboboxList), {
  loading: () => <p className="p-4 text-sm text-stone-500">Loading…</p>,
});

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
  as = "div",
}: {
  name: string;
  label: string;
  tooltip?: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  className?: string;
  as?: "div" | "fieldset";
}) {
  const ids = fieldIds(name);
  const Wrapper = as;
  const LabelTag = as === "fieldset" ? "legend" : "label";
  return (
    <Wrapper className={cn("min-w-0 space-y-2", className)}>
      <div className="flex items-center gap-1.5">
        <LabelTag
          id={ids.label}
          {...(as === "div" ? { htmlFor: ids.input } : {})}
          className="text-sm font-medium text-stone-800"
        >
          {label}
        </LabelTag>
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
    </Wrapper>
  );
}

export function Combobox({
  name,
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText = "No results found.",
  disabled,
  invalid,
  hint,
}: {
  name: string;
  options: Option[];
  value?: string;
  onChange: (v: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyText?: string;
  disabled?: boolean;
  invalid?: boolean;
  hint?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ids = fieldIds(name);
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={ids.input}
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={invalid || undefined}
        aria-labelledby={`${ids.label} ${ids.input}`}
        aria-describedby={describedBy(name, hint, invalid)}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-input bg-white px-3 text-left text-sm transition-colors outline-none",
          "hover:border-stone-400 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:opacity-60",
          "aria-invalid:border-danger aria-invalid:ring-3 aria-invalid:ring-danger/15",
        )}
      >
        <span className={cn("truncate", !selected && "text-stone-500")}>{selected ? selected.label : placeholder}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-stone-500" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) min-w-64 p-0">
        {open && (
          <ComboboxList
            options={options}
            value={value}
            searchPlaceholder={searchPlaceholder}
            emptyText={emptyText}
            onSelect={(v) => {
              onChange(v);
              setOpen(false);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Native radio inputs styled as cards — fully keyboard accessible (arrow keys) out of the box. */
export function RadioCards({
  name,
  options,
  value,
  onChange,
  invalid,
  columns = 2,
}: {
  name: string;
  options: (Option & { description?: string; icon?: React.ReactNode })[];
  value?: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  columns?: 2 | 3 | 4;
}) {
  const ids = fieldIds(name);
  return (
    <div
      role="radiogroup"
      aria-labelledby={ids.label}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy(name, false, invalid)}
      className={cn(
        "grid gap-2",
        columns === 2 && "grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-3",
        columns === 4 && "grid-cols-2 sm:grid-cols-4",
      )}
    >
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <label
            key={o.value}
            className={cn(
              "relative flex cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 py-2.5 text-sm transition-colors",
              "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/40",
              checked ? "border-brand bg-brand-soft font-medium text-navy" : "border-input text-stone-700 hover:border-stone-400",
              invalid && !value && "border-danger/60",
            )}
          >
            <input
              type="radio"
              id={i === 0 ? ids.input : undefined}
              name={name}
              value={o.value}
              checked={checked}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            <span
              aria-hidden
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-full border",
                checked ? "border-brand bg-brand" : "border-stone-400",
              )}
            >
              {checked && <span className="size-1.5 rounded-full bg-white" />}
            </span>
            {o.icon}
            <span className="min-w-0">
              <span className="block">{o.label}</span>
              {o.description && <span className="block text-xs font-normal text-stone-500">{o.description}</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
}

const grouping = new Intl.NumberFormat("en-IN");

/** Rupee amount input showing Indian digit grouping while storing a plain integer. */
export function AmountInput({
  name,
  value,
  onChange,
  onBlur,
  invalid,
  hint,
  placeholder,
}: {
  name: string;
  value?: number;
  onChange: (v: number | undefined) => void;
  onBlur?: () => void;
  invalid?: boolean;
  hint?: boolean;
  placeholder?: string;
}) {
  const ids = fieldIds(name);
  const display = typeof value === "number" && Number.isFinite(value) ? grouping.format(value) : "";
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-stone-500" aria-hidden>
        ₹
      </span>
      <input
        id={ids.input}
        name={name}
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={display}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, "").slice(0, 10);
          onChange(digits ? Number(digits) : undefined);
        }}
        onBlur={onBlur}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy(name, hint, invalid)}
        className="h-11 w-full rounded-lg border border-input bg-white pl-7 pr-3 text-base tabular-nums outline-none transition-colors placeholder:text-stone-400 hover:border-stone-400 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-danger aria-invalid:ring-3 aria-invalid:ring-danger/15 md:text-sm"
      />
    </div>
  );
}
