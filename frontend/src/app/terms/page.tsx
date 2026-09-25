import type { Metadata } from "next";
import { PageHeader } from "@/components/site/page-header";
import { LegalBody } from "@/components/site/legal";
import { DISCLAIMER } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "Terms governing use of the LendWise demo platform.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <>
      <PageHeader eyebrow="Legal" title="Terms of use" />
      <LegalBody updated="25 September 2026">
        <p>By using LendWise you agree to these terms. If you do not agree, please do not use the platform.</p>
        <h2>Not a credit offer</h2>
        <p>{DISCLAIMER} No loan will be disbursed, and an approval on LendWise creates no obligation on anyone to lend.</p>
        <h2>Your responsibilities</h2>
        <ul>
          <li>Provide information that is accurate to the best of your knowledge. Please avoid entering sensitive real data you are not comfortable sharing with a demo.</li>
          <li>Do not attempt to disrupt, overload, scrape or gain unauthorised access to the service.</li>
        </ul>
        <h2>Estimates</h2>
        <p>EMI figures use a fixed demonstration interest rate and a standard reducing-balance formula. They are indicative only.</p>
        <h2>Model limitations</h2>
        <p>The model may be wrong and may reflect biases in historical data. Do not rely on it for real financial decisions.</p>
        <h2>Liability</h2>
        <p>The platform is provided “as is” for educational purposes, without warranties of any kind. To the extent permitted by law, we are not liable for any loss arising from its use.</p>
        <h2>Changes</h2>
        <p>We may update these terms from time to time. Continued use after changes means you accept the updated terms.</p>
      </LegalBody>
    </>
  );
}
