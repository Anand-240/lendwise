import type { Metadata } from "next";
import { PageHeader } from "@/components/site/page-header";
import { ScreenForm } from "@/components/screen/screen-form";

export const metadata: Metadata = {
  title: "Screen an application",
  description: "Enter a loan amount, FICO score and DTI to get the eligibility tier, charge-off risk tier, decision and any counter-offer.",
  alternates: { canonical: "/screen" },
};

export default async function ScreenPage(props: PageProps<"/screen">) {
  const sp = await props.searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 20) : undefined);
  return (
    <>
      <PageHeader
        eyebrow="Screen an application"
        title="Screen a loan application"
        description="Enter three values. LendWise checks them, scores eligibility and charge-off risk, applies the decision rules and looks for a smaller amount it could offer. Nothing you enter here is saved."
      />
      <div className="bg-stone-50">
        <div className="container-page py-10 md:py-12">
          <ScreenForm initial={{ loan_amount: pick("loan"), fico: pick("fico"), dti: pick("dti") }} />
        </div>
      </div>
    </>
  );
}
