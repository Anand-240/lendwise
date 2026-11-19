"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";
import { DISCLAIMER, PROJECT } from "@/lib/site";

const COLUMNS = [
  {
    title: "Use LendWise",
    links: [
      { href: "/screen", label: "Screen an application" },
      { href: "/apply", label: "Apply for review" },
      { href: "/status", label: "Track application" },
    ],
  },
  {
    title: "The project",
    links: [
      { href: "/how-it-works", label: "How it works" },
      { href: "/results", label: "Results and audit" },
      { href: "/about", label: "About the team" },
      { href: PROJECT.repo, label: "Source code" },
    ],
  },
  {
    title: "Help",
    links: [
      { href: "/faq", label: "FAQ" },
      { href: "/contact", label: "Contact us" },
      { href: "/admin/login", label: "Officer login" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms of use" },
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
          <p className="text-sm leading-relaxed">
            Loan eligibility screening and charge-off risk prediction using machine learning.
          </p>
          <p className="text-xs leading-relaxed text-stone-400">
            B.Tech project, {PROJECT.department}, {PROJECT.college}.
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
            LendWise is not a lender and does not pay out loans. The models were trained on US LendingClub data and use the US FICO
            score, so they would need retraining on local bureau data (for example CIBIL scores) before any use in India. Questions can be
            sent through the <Link href="/contact" className="text-stone-200 underline">contact form</Link>.
          </p>
          <p className="pt-2 text-stone-400">© {new Date().getFullYear()} LendWise project team.</p>
        </div>
      </div>
    </footer>
  );
}
