"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Logo } from "./logo";
import { ButtonLink } from "./button-link";
import { NAV_LINKS, UTILITY_LINKS } from "@/lib/site";
import { cn } from "@/lib/utils";

// The drawer (and its dialog library) only loads the first time the menu is opened.
const MobileNav = dynamic(() => import("./mobile-nav").then((m) => m.MobileNav), { ssr: false });

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (pathname.startsWith("/admin")) return null;

  return (
    <header className="no-print sticky top-0 z-40 bg-white">
      <div className="hidden border-b border-stone-200 bg-stone-50 md:block">
        <div className="container-page flex h-9 items-center justify-between text-xs text-stone-600">
          <p>Instant loan decisions · 100% online</p>
          <nav aria-label="Utility" className="flex items-center divide-x divide-stone-300">
            {UTILITY_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="px-3 last:pr-0 hover:text-navy hover:underline">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      <div className="border-b border-stone-200">
        <div className="container-page flex h-16 items-center justify-between gap-6">
          <Logo />
          <nav aria-label="Main" className="hidden h-full items-stretch gap-1 lg:flex">
            {NAV_LINKS.map((l) => {
              const active = l.href === pathname;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center border-b-2 px-3 text-[0.9rem] font-medium transition-colors",
                    active ? "border-brand text-navy" : "border-transparent text-stone-700 hover:border-stone-300 hover:text-navy",
                  )}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <ButtonLink href="/status" variant="outline" className="hidden sm:inline-flex">
              Track application
            </ButtonLink>
            <ButtonLink href="/apply" variant="brand" className="hidden sm:inline-flex">
              Apply now
            </ButtonLink>
            <button
              type="button"
              onClick={() => {
                setLoaded(true);
                setOpen(true);
              }}
              className="inline-flex size-10 items-center justify-center rounded-md text-navy hover:bg-stone-100 lg:hidden"
              aria-label="Open menu"
              aria-expanded={open}
            >
              <Menu className="size-5" aria-hidden />
            </button>
            {loaded && <MobileNav open={open} onOpenChange={setOpen} />}
          </div>
        </div>
      </div>
    </header>
  );
}
