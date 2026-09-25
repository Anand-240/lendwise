"use client";

import Link from "next/link";
import { Logo } from "./logo";
import { ButtonLink } from "./button-link";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { NAV_LINKS, UTILITY_LINKS } from "@/lib/site";

export function MobileNav({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const close = () => onOpenChange(false);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[85vw] max-w-sm">
        <SheetHeader>
          <SheetTitle>
            <span className="sr-only">Navigation</span>
          </SheetTitle>
          <Logo />
        </SheetHeader>
        <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
          {[...NAV_LINKS, ...UTILITY_LINKS.filter((u) => !NAV_LINKS.some((n) => n.href === u.href))].map((l) => (
            <Link key={l.href} href={l.href} onClick={close} className="rounded-md px-3 py-3 text-base font-medium text-stone-700 hover:bg-stone-100">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 flex flex-col gap-2 px-4">
          <ButtonLink href="/apply" variant="brand" size="lg" onClick={close}>
            Apply now
          </ButtonLink>
          <ButtonLink href="/status" variant="outline" size="lg" onClick={close}>
            Track application
          </ButtonLink>
        </div>
      </SheetContent>
    </Sheet>
  );
}
