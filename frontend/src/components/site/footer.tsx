"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";
import { DISCLAIMER } from "@/lib/site";

const COLUMNS = [
  {
    title: "Loans",
    links: [
      { href: "/apply?purpose=Personal", label: "Personal loan" },
      { href: "/apply?purpose=Home", label: "Home loan" },
      { href: "/apply?purpose=Vehicle", label: "Vehicle loan" },
      { href: "/apply?purpose=Education", label: "Education loan" },
      { href: "/apply?purpose=Business", label: "Business loan" },
    ],
  },
  {
    title: "Tools",
    links: [
      { href: "/#emi-calculator", label: "EMI calculator" },
      { href: "/rates", label: "Rates & charges" },
      { href: "/status", label: "Track application" },
      { href: "/#eligibility", label: "Eligibility" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About LendWise" },
      { href: "/how-it-works", label: "How we decide" },
      { href: "/faq", label: "Help centre" },
      { href: "/contact", label: "Contact us" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms of use" },
      { href: "/admin/login", label: "Officer login" },
    ],
  },
];

export function SiteFooter() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;
  return (
    <footer className="no-print bg-[#12100E] text-stone-300">
      <div className="container-page grid gap-10 py-12 md:grid-cols-[1.3fr_repeat(4,1fr)]">
        <div className="max-w-xs space-y-4">
          <Logo light />
          <p className="text-sm leading-relaxed">Online loan applications with an instant, explained decision.</p>
          <p className="text-sm">
            Customer support
            <br />
            <span className="text-white">support@lendwise.demo</span>
            <br />
            <span className="text-xs text-stone-400">Mon–Sat, 9:30 am – 6:30 pm IST</span>
          </p>
        </div>
        {COLUMNS.map((c) => (
          <div key={c.title}>
            <h2 className="text-xs font-semibold tracking-wide text-white">{c.title}</h2>
            <ul className="mt-4 space-y-2.5">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-stone-300 hover:text-white hover:underline">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="container-page space-y-3 py-8 text-xs leading-relaxed text-stone-400">
          <p className="font-semibold text-stone-200">Important information</p>
          <p>{DISCLAIMER}</p>
          <p>
            LendWise is not a bank or a non-banking financial company, is not registered with the Reserve Bank of India, and does not disburse loans.
            Interest rates, charges and EMIs shown are indicative. Grievances can be raised through the{" "}
            <Link href="/contact" className="text-stone-200 underline">contact form</Link> and are acknowledged within two business days.
          </p>
          <p className="pt-2 text-stone-400">© {new Date().getFullYear()} LendWise. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
