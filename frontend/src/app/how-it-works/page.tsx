import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/site/page-header";
import { ButtonLink } from "@/components/site/button-link";
import { Disclaimer } from "@/components/site/disclaimer";
import { getMetadataUncachedOnFailure } from "@/lib/backend";
import { formatNumber, formatPct, formatPercent, formatUSD } from "@/lib/format";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "The LendWise method: two LendingClub datasets, monotonic histogram gradient boosting with sigmoid calibration, expected-loss decision rules, a range guard and a counter-offer search.",
  alternates: { canonical: "/how-it-works" },
};
export const revalidate = 300;

const LAYERS = [
  ["Presentation", "The form where the user types the values and sees the tiers, the decision and any counter-offer."],
  ["Decision", "Expected loss, the approve, review or reject rules, the counter-offer search and the tiers."],
  ["Validation and guard", "Checks every input before it is scored and flags anything outside the range seen in training."],
  ["Model", "The eligibility model and the charge-off model (monotonic gradient boosting with sigmoid calibration)."],
  ["Data preparation", "Builds the two datasets, matches the column names of the two files, cleans DTI and splits the data."],
  ["Data source", "The LendingClub accepted loans file (about 2.26 million loans) and rejected applications file (about 27.6 million)."],
];

function Eq({ children, n }: { children: React.ReactNode; n: string }) {
  return (
    <div className="my-4 flex items-center justify-between gap-4 rounded-md bg-stone-50 px-4 py-3 font-mono text-sm text-navy">
      <span className="overflow-x-auto">{children}</span>
      <span className="shrink-0 text-xs text-stone-500">({n})</span>
    </div>
  );
}

export default async function HowItWorksPage() {
  const md = await getMetadataUncachedOnFailure();
  const d = md?.data;
  const t = md?.thresholds;
  const g = md?.guard;

  return (
    <>
      <PageHeader
        eyebrow="How it works"
        title="How LendWise screens an application"
        description="Two datasets, two constrained and calibrated models, simple decision rules based on expected loss, and a check on every input. Here is each part and why it is there."
      />

      <section className="container-page py-14" aria-labelledby="layers-heading">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 id="layers-heading" className="text-2xl font-semibold text-navy">Six layers</h2>
            <p className="mt-3 leading-relaxed text-stone-600">
              The system is built as six layers. The offline part (data preparation and model building) runs once as scripts. The online
              part runs for every application: the inputs go through the validator, the saved models give a score and a probability, and
              the decision layer turns them into a result. The website, the API and the acceptance tests all call the same validator and
              decision code, so what is tested is exactly what you use.
            </p>
          </div>
          <ol className="space-y-2">
            {LAYERS.map(([name, text], i) => (
              <li key={name} className="flex gap-4 rounded-md border border-stone-200 bg-white p-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-navy text-sm font-semibold text-white tabular-nums">
                  {LAYERS.length - i}
                </span>
                <div>
                  <h3 className="font-semibold text-navy">{name} layer</h3>
                  <p className="text-sm text-stone-600">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-y border-stone-200 bg-stone-50 py-14" aria-labelledby="data-heading">
        <div className="container-page">
          <h2 id="data-heading" className="text-2xl font-semibold text-navy">The data</h2>
          <p className="mt-3 max-w-3xl leading-relaxed text-stone-600">
            The accepted file holds loans issued from 2007 to 2018; the rejected file has only nine columns and no outcome. FICO is a US
            credit score from 300 to 850 (higher is better) and DTI is the share of monthly income already going to debt payments (lower is
            better). Rejected-file columns were renamed to match, the % sign was removed from DTI, the low end of the FICO range was used,
            and any row with a missing input or a DTI outside 0 to 100 was dropped.
          </p>
          <div className="mt-6 overflow-x-auto rounded-lg border border-stone-200 bg-white">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">Datasets used for training and testing</caption>
              <thead className="bg-stone-50 text-xs text-stone-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Item</th>
                  <th scope="col" className="px-4 py-3 font-medium">Eligibility dataset</th>
                  <th scope="col" className="px-4 py-3 font-medium">Charge-off dataset</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Records", "100,000 accepted + 100,000 rejected", "Funded 36-month loans, Fully Paid or Charged Off"],
                  ["Period", "Applications in 2016", "Issued 2012 to 2015"],
                  ["Target", "Accepted = 1, rejected = 0", "Charged Off = 1, Fully Paid = 0"],
                  ["Split", "Random 80:20, stratified", "Train 2012 to 2014, test 2015"],
                  [
                    "Size",
                    d ? `${formatNumber(d.eligibility.train_rows)} train, ${formatNumber(d.eligibility.test_rows)} test` : "160,000 train, 40,000 test",
                    d ? `${formatNumber(d.chargeoff.train_rows)} train, ${formatNumber(d.chargeoff.test_rows)} test` : "300,000 train, 100,000 test",
                  ],
                  [
                    "Positive rate",
                    d ? `50% in sample (${formatPercent(d.eligibility.real_acceptance_rate)} in reality)` : "50% in sample (about 8% in reality)",
                    d ? `${formatPercent(d.chargeoff.train_rate, 2)} train, ${formatPercent(d.chargeoff.test_rate, 2)} test` : "13.26% train, 14.82% test",
                  ],
                ].map(([k, a, b]) => (
                  <tr key={k} className="border-t border-stone-100">
                    <th scope="row" className="px-4 py-3 font-medium text-stone-900">{k}</th>
                    <td className="px-4 py-3 text-stone-700">{a}</td>
                    <td className="px-4 py-3 text-stone-700">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-stone-600">
            Only 2016 applications are used for eligibility, because in a first attempt most accepted loans came from later years and most
            rejected ones from earlier years, and a model could simply learn the year. Only 36-month loans issued up to 2015 are used for
            risk: many 60-month loans had not finished when the data ends, and a 36-month loan from 2016 would end after the data stops.
          </p>
        </div>
      </section>

      <section className="container-page py-14" aria-labelledby="algo-heading">
        <h2 id="algo-heading" className="text-2xl font-semibold text-navy">The models</h2>
        <div className="mt-6 grid gap-10 lg:grid-cols-3">
          <div>
            <h3 className="text-lg font-semibold text-navy">Histogram gradient boosting</h3>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">
              Small decision trees are built one after another, each one correcting the mistakes of the trees before it, and added with a
              small learning rate η = 0.1. Each input is first put into at most 255 bins, so 300,000 rows train in seconds. It needs no
              scaling, captures interactions, and supports monotonic constraints directly.
            </p>
            <Eq n="4.1">F<sub>m</sub>(x) = F<sub>m-1</sub>(x) + η · h<sub>m</sub>(x)</Eq>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-navy">Monotonic constraints</h3>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">
              Two applicants ask for the same amount with the same DTI, one with FICO 700 and one with 720. The second should never look
              riskier. A constraint only allows tree splits that keep the output moving one way for an input. In the order [loan amount,
              FICO, DTI]:
            </p>
            <ul className="mt-3 space-y-1 font-mono text-sm text-navy">
              <li>Eligibility: [-1, +1, -1]</li>
              <li>Charge-off: [+1, -1, +1]</li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-navy">Sigmoid calibration</h3>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">
              A model is calibrated if, of all loans it gives a 20% risk, about 20% default. The raw score f(x) goes through a sigmoid
              (Platt scaling). With 3-fold cross-validation, A and B are fitted on the fold the trees did not see, and the final model is the
              average of the three. The sigmoid always rises, so the constraints still hold.
            </p>
            <Eq n="4.2">p(x) = 1 / (1 + exp(A · f(x) + B))</Eq>
          </div>
        </div>
        <div className="mt-8 overflow-x-auto rounded-lg border border-stone-200">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <caption className="sr-only">Model settings</caption>
            <thead className="bg-stone-50 text-xs text-stone-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Setting</th>
                <th scope="col" className="px-4 py-3 font-medium">Eligibility model</th>
                <th scope="col" className="px-4 py-3 font-medium">Charge-off model</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Max iterations / max leaf nodes", "150 / 8", "150 / 8"],
                ["Min samples per leaf / L2", "2,000 / 10.0", "2,000 / 10.0"],
                ["Monotonic constraints", "[-1, +1, -1]", "[+1, -1, +1]"],
                ["Calibration", "Sigmoid, 3-fold CV", "Sigmoid, 3-fold CV"],
                ["Output", "Score 0 to 100", "Default probability 0 to 100"],
              ].map(([k, a, b]) => (
                <tr key={k} className="border-t border-stone-100">
                  <th scope="row" className="px-4 py-3 font-medium text-stone-900">{k}</th>
                  <td className="px-4 py-3 font-mono text-stone-700">{a}</td>
                  <td className="px-4 py-3 font-mono text-stone-700">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-stone-600">
          SMOTE oversampling was deliberately not used, because the default probability has to stay realistic for the expected-loss rule,
          and no field filled in after the loan was issued is used.
        </p>
      </section>

      <section className="border-y border-stone-200 bg-stone-50 py-14" aria-labelledby="rules-heading">
        <div className="container-page grid gap-10 lg:grid-cols-2">
          <div>
            <h2 id="rules-heading" className="text-2xl font-semibold text-navy">Decision rules</h2>
            <p className="mt-3 leading-relaxed text-stone-600">
              Expected loss comes from the default probability PD (in percent) and the severity s, the average share of principal lost on a
              charged-off loan. In the training data s is {md ? formatPercent(md.severity) : "50.3%"}. A regression model for severity
              barely improved on the average, so the average is used.
            </p>
            <Eq n="4.3">EL = PD × s ÷ 100, s = {md ? formatPercent(md.severity) : "50.3%"}</Eq>
            <ol className="space-y-3 text-sm text-stone-700">
              <li><strong className="text-rose-800">1. Reject</strong> if the eligibility score is below {t?.reject_eligibility ?? 40}.</li>
              <li><strong className="text-rose-800">2. Reject</strong> if the expected loss is above {t?.reject_el ?? 11.07}% (PD above {t?.reject_pd ?? 22}%).</li>
              <li><strong className="text-amber-800">3. Review</strong> if the range guard flagged the inputs.</li>
              <li><strong className="text-emerald-800">4. Approve</strong> if the score is {t?.approve_eligibility ?? 75} or more and the expected loss is at most {t?.approve_el ?? 6.04}% (PD up to {t?.approve_pd ?? 12}%).</li>
              <li><strong className="text-amber-800">5. Review</strong> in every other case.</li>
            </ol>
            <p className="mt-4 text-sm text-stone-600">
              These are demonstration thresholds, not regulatory values. The eligibility score is not a real approval probability: the
              sample was 50/50 while only about 8% of applications were accepted, so a score of 75 corresponds to only about 21%.
            </p>
          </div>
          <div className="space-y-6">
            <div className="rounded-lg border border-stone-200 bg-white p-6">
              <h3 className="text-lg font-semibold text-navy">Range guard</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                Flags inputs outside the 0.1st to 99.9th percentile of the training loans, or unusual combinations found by an Isolation
                Forest with {g?.isolation_trees ?? 200} trees. A flagged case is never approved automatically; it goes to review.
              </p>
              {g && (
                <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  {[
                    ["Loan amount", `${formatUSD(g.limits.loan_amount.low)} to ${formatUSD(g.limits.loan_amount.high)}`],
                    ["FICO", `${g.limits.fico.low} to ${g.limits.fico.high}`],
                    ["DTI", `${g.limits.dti.low}% to ${g.limits.dti.high}%`],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-md bg-stone-50 p-3">
                      <dt className="text-xs text-stone-500">{k}</dt>
                      <dd className="mt-0.5 font-medium text-navy">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            <div className="rounded-lg border border-stone-200 bg-white p-6">
              <h3 className="text-lg font-semibold text-navy">Counter-offer search</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                When an application is rejected or sent for review, smaller loan amounts are tried in ${md?.counter_offer_step ?? 500} steps.
                The largest amount the rules would approve is offered instead. Because both models are monotonic in the loan amount, a
                smaller loan can only look better, never worse.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="container-page py-14" aria-labelledby="eval-heading">
        <h2 id="eval-heading" className="text-2xl font-semibold text-navy">How it is evaluated</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {[
            ["ROC AUC", "How likely the model is to score a random positive case above a random negative one. 0.5 is guessing and 1.0 is perfect."],
            ["Calibration", "The test loans are sorted into ten groups by predicted risk, and the predicted and actual default rates are compared in each. The Brier score, the mean squared gap between probability and outcome, is compared with always predicting the base rate."],
            [
              "Nudge test",
              `On ${md && "nudge" in md.evaluation ? md.evaluation.nudge.profiles : 551} random profiles the loan amount is changed by 1%, FICO by 1 point and DTI by 0.5. A profile is jumpy if eligibility moves by more than 10 points or risk by more than 3 points.`,
            ],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-stone-200 p-5">
              <h3 className="font-semibold text-navy">{k}</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">{v}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <div className="rounded-lg border border-l-4 border-stone-200 border-l-amber-500 p-6">
            <h3 className="text-lg font-semibold text-navy">Limitations</h3>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-stone-700">
              <li>With only three inputs the charge-off AUC stays around {md ? md.metrics.chargeoff.roc_auc.toFixed(2) : "0.63"}. Extra fields such as income and credit history raise it only to about 0.67.</li>
              <li>The risk model only sees funded loans, and almost all have a FICO score of 660 or more, so risk below 660 is a guess.</li>
              <li>Rejected applicants have no outcome, so we cannot learn whether they would have repaid.</li>
              <li>The data is from the US, 2012 to 2016. Recent or Indian data was not tested.</li>
            </ul>
          </div>
          <div className="rounded-lg border border-l-4 border-stone-200 border-l-brand p-6">
            <h3 className="text-lg font-semibold text-navy">Fairness and oversight</h3>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-stone-700">
              <li>A fairness and adverse-impact analysis (for example equalized odds) has not been done, because the public files have no group labels. It must be done before any use on real people.</li>
              <li>Every application is decided by a loan officer, who sees the recommendation and its reasons. Going against a clear recommendation needs a written note, and the original recommendation is kept.</li>
              <li>Tree-based feature importance is not reported, because it is known to be misleading.</li>
            </ul>
          </div>
        </div>
        <Disclaimer className="mt-8" />
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/screen" variant="brand" size="lg">
            Screen an application <ArrowRight aria-hidden />
          </ButtonLink>
          <ButtonLink href="/results" variant="outline" size="lg">
            See the results
          </ButtonLink>
        </div>
        {md && (
          <p className="mt-6 text-center text-xs text-stone-500">
            Model {md.model_version}, trained with Python {md.environment.python}, scikit-learn {md.environment.scikit_learn}, pandas {md.environment.pandas} and NumPy {md.environment.numpy}, seed {md.environment.seed}. Mean predicted default rate {formatPct(md.metrics.chargeoff.mean_predicted)}.
          </p>
        )}
      </section>
    </>
  );
}
