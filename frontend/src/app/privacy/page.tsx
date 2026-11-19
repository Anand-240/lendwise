import type { Metadata } from "next";
import { PageHeader } from "@/components/site/page-header";
import { LegalBody } from "@/components/site/legal";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How LendWise collects, uses and protects your information.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <>
      <PageHeader eyebrow="Legal" title="Privacy policy" />
      <LegalBody updated="20 November 2026">
        <p>This policy explains what LendWise collects when you use it and how we handle it.</p>
        <h2>Information we collect</h2>
        <ul>
          <li><strong>Screening only (Screen page):</strong> the loan amount, FICO score and DTI you type are scored and then discarded. Nothing is stored.</li>
          <li><strong>Applications:</strong> full name, email address, loan purpose, and the loan amount, FICO score and DTI, together with the screening result.</li>
          <li><strong>Technical:</strong> request identifiers and IP address for security and rate limiting. We do not use advertising trackers.</li>
        </ul>
        <h2>How we use it</h2>
        <ul>
          <li>To screen your application with the eligibility and charge-off models.</li>
          <li>To let an authorised loan officer review the result and make the final decision.</li>
          <li>To let you check the status of your application with its ID and your email address.</li>
        </ul>
        <h2>Automated decision-making</h2>
        <p>
          LendWise only recommends approve, review or reject. A loan officer makes every final decision. Your application page shows the
          screening result and its reasons. See <a className="text-brand underline" href="/how-it-works">How it works</a> for details and limitations.
        </p>
        <h2>Security</h2>
        <p>
          Data is transmitted over HTTPS. Your application page is available only in the browser you applied from (via a private, http-only cookie) or by entering
          your application ID together with your email. Officer access requires authentication. Personal details are never written to application logs.
        </p>
        <h2>Sharing</h2>
        <p>We do not sell or share your information with third parties for marketing. LendWise does not share data with credit bureaus or lenders.</p>
        <h2>Retention & your choices</h2>
        <p>Data may be cleared periodically. To request deletion of an application, use the contact form with the topic &quot;Privacy&quot;, your application ID and the email you applied with. An officer will permanently delete the record.</p>
        <h2>Contact</h2>
        <p>Questions? Use our <a className="text-brand underline" href="/contact">contact form</a>.</p>
      </LegalBody>
    </>
  );
}
