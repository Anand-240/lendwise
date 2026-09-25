import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/site/page-header";
import { ButtonLink } from "@/components/site/button-link";
import { getMetadataUncachedOnFailure } from "@/lib/backend";
import { emiBreakdown } from "@/lib/emi";
import { formatINR } from "@/lib/format";
import { charges, PRODUCTS } from "@/lib/products";

export const metadata: Metadata = {
  title: "Rates & charges",
  description: "Interest rates, fees and charges for LendWise loans, with representative EMI examples.",
  alternates: { canonical: "/rates" },
};
export const revalidate = 300;

const EXAMPLES = [
  [100_000, 12],
  [500_000, 36],
  [1_000_000, 60],
  [2_500_000, 120],
  [5_000_000, 240],
] as const;

export default async function RatesPage() {
  const md = await getMetadataUncachedOnFailure();
  const rate = md?.interest_rate ?? 10.5;
  return (
    <>
      <PageHeader
        eyebrow="Rates & charges"
        title="Rates & charges"
        description="The same terms apply to every loan type. All figures are indicative and are not an offer of credit."
      />
      <div className="container-page grid gap-12 py-12 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-12">
          <section aria-labelledby="schedule-heading">
            <h2 id="schedule-heading" className="border-b border-stone-200 pb-3 text-xl font-semibold text-navy">Schedule of charges</h2>
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Schedule of charges</caption>
              <tbody>
                {charges(rate).map(([k, v]) => (
                  <tr key={k} className="border-b border-stone-200">
                    <th scope="row" className="w-1/3 py-3.5 pr-4 font-medium text-stone-900">{k}</th>
                    <td className="py-3.5 text-stone-700">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section aria-labelledby="products-heading">
            <h2 id="products-heading" className="border-b border-stone-200 pb-3 text-xl font-semibold text-navy">Loan amounts and tenures</h2>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-xs text-stone-500">
                    <th scope="col" className="py-3 pr-4 font-medium">Product</th>
                    <th scope="col" className="py-3 pr-4 font-medium">Loan amount</th>
                    <th scope="col" className="py-3 pr-4 font-medium">Tenure</th>
                    <th scope="col" className="py-3 font-medium">Interest rate</th>
                  </tr>
                </thead>
                <tbody>
                  {PRODUCTS.map((p) => (
                    <tr key={p.purpose} className="border-b border-stone-200">
                      <th scope="row" className="py-3.5 pr-4 font-medium text-stone-900">{p.name}</th>
                      <td className="py-3.5 pr-4 text-stone-700">{p.amount}</td>
                      <td className="py-3.5 pr-4 text-stone-700">{p.tenure}</td>
                      <td className="py-3.5 text-stone-700">From {rate}% p.a.</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="examples-heading">
            <h2 id="examples-heading" className="border-b border-stone-200 pb-3 text-xl font-semibold text-navy">Representative examples at {rate}% p.a.</h2>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[32rem] text-right text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-stone-200 text-xs text-stone-500">
                    <th scope="col" className="py-3 pr-4 text-left font-medium">Loan amount</th>
                    <th scope="col" className="py-3 pr-4 font-medium">Tenure</th>
                    <th scope="col" className="py-3 pr-4 font-medium">Monthly EMI</th>
                    <th scope="col" className="py-3 pr-4 font-medium">Total interest</th>
                    <th scope="col" className="py-3 font-medium">Total payable</th>
                  </tr>
                </thead>
                <tbody>
                  {EXAMPLES.map(([amt, n]) => {
                    const { emi, interest, total } = emiBreakdown(amt, rate, n);
                    return (
                      <tr key={amt} className="border-b border-stone-200">
                        <th scope="row" className="py-3.5 pr-4 text-left font-medium text-stone-900">{formatINR(amt)}</th>
                        <td className="py-3.5 pr-4 text-stone-700">{n} months</td>
                        <td className="py-3.5 pr-4 font-semibold text-navy">{formatINR(Math.round(emi))}</td>
                        <td className="py-3.5 pr-4 text-stone-700">{formatINR(Math.round(interest))}</td>
                        <td className="py-3.5 text-stone-700">{formatINR(Math.round(total))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-stone-500">
              Calculated on a reducing balance with equal monthly instalments. Excludes stamp duty and any applicable taxes.
            </p>
          </section>
        </div>

        <aside className="space-y-4 lg:pt-1">
          <div className="rounded-lg border border-stone-200 p-5">
            <h2 className="font-semibold text-navy">Does the loan amount affect approval?</h2>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">
              No. The decision is based on your applicant profile only. Amount and tenure are used to calculate your indicative EMI.{" "}
              <Link href="/how-it-works" className="text-brand underline underline-offset-2 hover:text-brand-deep">How we decide</Link>
            </p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-5">
            <h2 className="font-semibold text-navy">Ready to apply?</h2>
            <p className="mt-2 text-sm text-stone-600">It takes about three minutes and you’ll see your decision immediately.</p>
            <ButtonLink href="/apply" variant="brand" className="mt-4 w-full">Apply now</ButtonLink>
          </div>
        </aside>
      </div>
    </>
  );
}
