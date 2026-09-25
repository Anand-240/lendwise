"use client";

import { Check } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { Option } from "@/lib/types";

export function ComboboxList({
  options,
  value,
  onSelect,
  searchPlaceholder,
  emptyText,
}: {
  options: Option[];
  value?: string;
  onSelect: (v: string) => void;
  searchPlaceholder: string;
  emptyText: string;
}) {
  return (
    <Command>
      <CommandInput placeholder={searchPlaceholder} aria-label={searchPlaceholder} autoFocus />
      <CommandList>
        <CommandEmpty>{emptyText}</CommandEmpty>
        <CommandGroup>
          {options.map((o) => (
            <CommandItem key={o.value} value={o.value} keywords={[o.label]} onSelect={() => onSelect(o.value)} className="py-2">
              <Check className={cn("size-4 text-brand", o.value === value ? "opacity-100" : "opacity-0")} aria-hidden />
              {o.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
