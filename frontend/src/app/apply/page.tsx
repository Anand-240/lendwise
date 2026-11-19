import type { Metadata } from "next";
import Link from "next/link";
import { ApplyForm } from "@/components/apply/apply-form";
import { getMetadataUncachedOnFailure } from "@/lib/backend";

export const metadata: Metadata = {
  title: "Apply for a loan",
  description: "Submit a loan application for screening and a loan officer's decision.",
  alternates: { canonical: "/apply" },
};

const FALLBACK_PURPOSES = ["Debt consolidation", "Credit card refinancing", "Home improvement", "Major purchase", "Car", "Medical", "Business", "Other"];

export default async function ApplyPage(props: PageProps<"/apply">) {
  const sp = await props.searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 20) : undefined);
  const md = await getMetadataUncachedOnFailure();
  return (
    <div className="bg-stone-50">
      <div className="container-page py-10 md:py-14">
        <div className="mb-8 max-w-2xl">
          <nav aria-label="Breadcrumb" className="text-xs text-stone-500">
            <Link href="/" className="hover:text-navy hover:underline">Home</Link> <span aria-hidden>›</span>{" "}
            <span className="text-stone-700">Loan application</span>
          </nav>
          <h1 className="mt-3 text-3xl font-semibold text-navy md:text-[2.25rem]">Loan application</h1>
          <p className="mt-3 text-stone-600">
            Fill in the loan details and how to reach you. LendWise screens the application instantly, then a loan officer reviews it
            and makes the final decision. Just want a quick result? <Link href="/screen" className="text-brand underline">Screen without saving</Link>.
          </p>
        </div>
        <ApplyForm purposes={md?.purposes ?? FALLBACK_PURPOSES} initial={{ loan_amount: pick("loan"), fico: pick("fico"), dti: pick("dti") }} />
      </div>
    </div>
  );
}
