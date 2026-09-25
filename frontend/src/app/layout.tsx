import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { StatusBanner } from "@/components/site/status-banner";
import { LazyToaster } from "@/components/site/lazy-toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "LendWise — Instant AI-powered loan decisions",
    template: "%s · LendWise",
  },
  description:
    "Apply for a loan online and get an instant, transparent decision from a machine-learning risk model. 100% digital, decision in seconds.",
  applicationName: SITE_NAME,
  keywords: ["loan", "personal loan", "instant loan decision", "EMI calculator", "AI credit risk", "LendWise"],
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_IN",
    url: SITE_URL,
    title: "LendWise — Instant AI-powered loan decisions",
    description: "Apply online and get an instant, transparent loan decision from an ML risk model.",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#1C1917",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" className={plex.variable}>
      <body className="flex min-h-dvh flex-col bg-white font-sans text-stone-900">
        <a
          href="#main"
          className="sr-only z-50 rounded-lg bg-navy px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        <TooltipProvider delay={200}>
          <StatusBanner />
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </TooltipProvider>
        <LazyToaster />
      </body>
    </html>
  );
}
