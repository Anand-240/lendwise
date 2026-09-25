import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/site/page-header";
import { ButtonLink } from "@/components/site/button-link";
import { Disclaimer } from "@/components/site/disclaimer";
import { getMetadataUncachedOnFailure } from "@/lib/backend";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = {
  title: "How it works",
  description: "How LendWise turns your application into a decision: feature engineering, encoding, scaling and a Random Forest model — plus its metrics and limitations.",
  alternates: { canonical: "/how-it-works" },
};
export const revalidate = 300;

const PIPELINE = [
  { title: "Application form", text: "11 profile inputs: income, age, experience, job & residence years, marital status, house & car ownership, profession, city and state." },
  { title: "Feature engineering", text: "7 derived signals such as income per year of experience, career stability (job + residence years), experience ratio, financial maturity and age group." },
  { title: "Encoding", text: "Categories (profession, city, state, age group…) are one-hot encoded into 400+ binary columns, exactly as during training." },
  { title: "Scaling", text: "Ten numeric features are standardised with the scaler fitted on the training split, so values are on the same footing the model learned." },
  { title: "Random Forest", text: "An ensemble of 100 decision trees votes on whether the profile looks like past defaulters (class 1) or not (class 0)." },
  { title: "Decision", text: "Class 0 → Approved, class 1 → Rejected. Default probability sets the display risk band; indicative factors explain in plain language." },
];

const METRIC_INFO: Record<string, [string, string]> = {
  accuracy: ["Accuracy", "Share of all test applicants classified correctly."],
  precision: ["Precision", "Of applicants flagged high-risk, the share who actually defaulted."],
  recall: ["Recall", "Of applicants who actually defaulted, the share the model caught."],
  f1: ["F1 score", "Balance of precision and recall."],
  roc_auc: ["ROC AUC", "How well the model ranks risky applicants above safe ones (0.5 = random, 1 = perfect)."],
};

export default async function HowItWorksPage() {
  const md = await getMetadataUncachedOnFailure();
  return (
    <>
      <PageHeader
        eyebrow="How we decide"
        title="From your application to a decision, step by step"
        description="LendWise runs your profile through the same pipeline used to train its model. Here’s exactly what happens — and what doesn’t."
      />
      <section className="container-page py-16">
        <ol className="grid gap-x-8 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
          {PIPELINE.map((p, i) => (
            <li key={p.title} className="border-t-2 border-navy pt-4">
              <p className="text-sm font-semibold text-brand tabular-nums">Step {i + 1}</p>
              <h2 className="mt-1 text-lg font-semibold text-navy">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">{p.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-stone-50 py-16" aria-labelledby="metrics-heading">
        <div className="container-page grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 id="metrics-heading" className="text-2xl font-semibold text-navy md:text-3xl">Model performance</h2>
            <p className="mt-3 text-stone-600">
              Measured on a held-out test set the model never saw during training
              {md ? ` (${formatNumber(md.test_rows)} of ${formatNumber(md.training_rows)} applicants, 20% stratified split)` : ""}.
            </p>
            <p className="mt-3 text-sm text-stone-500">
              About 12% of applicants in the dataset defaulted, so accuracy alone flatters any model — precision and recall tell the fuller story.
            </p>
          </div>
          {md ? (
            <div className="overflow-hidden rounded-lg bg-white border border-stone-200">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Hold-out test metrics</caption>
                <thead className="bg-stone-50 text-xs text-stone-500">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-medium">Metric</th>
                    <th scope="col" className="px-5 py-3 font-medium">Value</th>
                    <th scope="col" className="hidden px-5 py-3 font-medium sm:table-cell">What it means</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(METRIC_INFO).map(([k, [label, help]]) => (
                    <tr key={k} className="border-t border-stone-100">
                      <th scope="row" className="px-5 py-3 font-medium text-stone-900">{label}</th>
                      <td className="px-5 py-3 font-semibold tabular-nums text-navy">{md.metrics[k as keyof typeof md.metrics].toFixed(3)}</td>
                      <td className="hidden px-5 py-3 text-stone-600 sm:table-cell">{help}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {md.metrics_note && <p className="border-t border-stone-100 px-5 py-3 text-xs text-stone-500">{md.metrics_note}</p>}
            </div>
          ) : (
            <p className="rounded-lg bg-white p-6 text-sm text-stone-600 ring-1 ring-stone-200">Metrics are temporarily unavailable.</p>
          )}
        </div>
      </section>

      <section className="container-page py-16" aria-labelledby="limits-heading">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-lg border border-stone-200 border-l-4 border-l-amber-500 bg-white p-6 md:p-8">
            <h2 id="limits-heading" className="text-xl font-semibold text-navy">
              Limitations
            </h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-stone-700">
              <li><strong>Loan amount is not a model input.</strong> Nor are tenure or purpose. The decision reflects applicant profile risk only — a ₹50,000 and a ₹50 lakh request from the same person get the same assessment.</li>
              <li><strong>No credit bureau data.</strong> The model doesn’t see credit scores, existing loans or repayment history, which real lenders rely on.</li>
              <li><strong>Training data range.</strong> Some values (for example, years at current residence between 10 and 14) were narrow in training; inputs outside those ranges produce a warning and less reliable predictions.</li>
              <li><strong>Indicative factors are heuristics.</strong> They compare your features to training medians; they are not exact explanations of the Random Forest’s internal logic.</li>
            </ul>
          </div>
          <div className="rounded-lg border border-stone-200 border-l-4 border-l-brand p-6 md:p-8">
            <h2 className="text-xl font-semibold text-navy">
              Fairness
            </h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-stone-700">
              <li>The model learns from historical outcomes, which may reflect past inequities. Features such as <strong>city, state and profession</strong> can act as proxies for socio-economic or demographic characteristics and may encode bias.</li>
              <li>Marital status and age are used as inputs. In real lending, the use of such attributes is subject to regulation and careful fairness review.</li>
              <li>Every decision can be reviewed and overridden by a loan officer, with the original model decision retained for audit.</li>
              <li>The model’s output should not be the sole basis for real credit decisions.</li>
            </ul>
          </div>
        </div>
        <Disclaimer className="mt-8" />
        <div className="mt-10 text-center">
          <ButtonLink href="/apply" variant="brand" size="lg">
            Try it — apply now <ArrowRight aria-hidden />
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
