import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { StatusBanner } from "@/components/site/status-banner";
import { LazyToaster } from "@/components/site/lazy-toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";

// IBM Plex Sans, self-hosted from @fontsource so builds never depend on fetching Google Fonts.
const plex = localFont({
  src: [
    { path: "../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s · LendWise",
  },
  description:
    "LendWise screens a loan application from three inputs (loan amount, FICO score and DTI) with two monotonic, calibrated gradient boosting models trained on public LendingClub data, and helps a human reviewer decide.",
  applicationName: SITE_NAME,
  keywords: ["loan screening", "credit risk", "charge-off prediction", "LendingClub", "gradient boosting", "monotonic constraints", "calibration", "LendWise"],
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
    url: SITE_URL,
    title: SITE_TITLE,
    description: "Eligibility screening and charge-off risk from loan amount, FICO score and DTI, with an officer making the final call.",
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
    <html lang="en" className={plex.variable}>
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
