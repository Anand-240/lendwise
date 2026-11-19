export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
export const SITE_NAME = "LendWise";
export const SITE_TITLE = "LendWise: Loan eligibility screening and charge-off risk prediction";

export const DISCLAIMER =
  "LendWise is a loan screening prototype built on public LendingClub data from 2012 to 2016. It assists a human reviewer and does not make lending decisions on its own. Nothing on this site is a credit offer.";

export const NAV_LINKS = [
  { href: "/screen", label: "Screen an application" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/results", label: "Results" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
];

export const UTILITY_LINKS = [
  { href: "/status", label: "Track application" },
  { href: "/contact", label: "Contact" },
  { href: "/admin/login", label: "Officer login" },
];

export const PROJECT = {
  title: "LendWise: Loan Eligibility Screening and Charge-Off Risk Prediction Using Machine Learning",
  team: ["Anand Prakash Srivastava", "Amit Singh", "Anant Gopal Chaurasia", "Anmol Anand", "Ankit Maurya"],
  mentor: "Ms. Tanvishree, Assistant Professor",
  hod: "Prof. (Dr.) Shruti Gupta",
  department: "Department of Computer Science & Engineering",
  college: "ABES Engineering College, Ghaziabad",
  university: "Dr. A.P.J. Abdul Kalam Technical University (AKTU)",
  repo: "https://github.com/Anand-240/lendwise",
};
