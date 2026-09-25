import type { Metadata } from "next";
import Link from "next/link";
import { ApplyWizard } from "@/components/apply/apply-wizard";
import { ServiceUnavailable } from "@/components/site/service-unavailable";
import { getMetadataUncachedOnFailure } from "@/lib/backend";

export const metadata: Metadata = {
  title: "Apply for a loan",
  description: "Complete a 5-step online loan application and get an instant AI-powered decision.",
  alternates: { canonical: "/apply" },
};

// ISR: metadata changes rarely; a short window also lets an "unavailable" render recover quickly.
export const revalidate = 60;

export default async function ApplyPage() {
  const md = await getMetadataUncachedOnFailure();
  return (
    <div className="bg-stone-50">
      <div className="container-page py-10 md:py-14">
        <div className="mb-8 max-w-2xl">
          <nav aria-label="Breadcrumb" className="text-xs text-stone-500">
            <Link href="/" className="hover:text-navy hover:underline">Home</Link> <span aria-hidden>›</span> <span className="text-stone-700">Loan application</span>
          </nav>
          <h1 className="mt-3 text-3xl font-semibold text-navy md:text-[2.25rem]">Loan application</h1>
          <p className="mt-3 text-stone-600">
            Five short sections, about three minutes. Our risk model assesses it instantly and a loan officer confirms the final decision.
          </p>
        </div>
        {md ? <ApplyWizard metadata={md} /> : <ServiceUnavailable />}
      </div>
    </div>
  );
}
