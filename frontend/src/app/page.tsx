import Link from "next/link";
import { ArrowRight, Check, Gauge, ScanSearch, ShieldCheck, Split, X } from "lucide-react";
import { ButtonLink } from "@/components/site/button-link";
import { FaqList } from "@/components/site/faq-list";
import { getMetadataUncachedOnFailure } from "@/lib/backend";
import { FAQS } from "@/lib/faq";
import { formatAuc, formatNumber, formatPct, formatPercent } from "@/lib/format";
import type { Acceptance } from "@/lib/types";

export const revalidate = 300;

function SectionHeading({ title, text, action, id }: { title: string; text?: string; action?: React.ReactNode; id?: string }) {
  return (
    <div className="flex flex-col justify-between gap-3 border-b border-stone-200 pb-4 md:flex-row md:items-end">
      <div className="max-w-2xl">
        <h2 id={id} className="text-2xl font-semibold text-navy md:text-[1.75rem]">{title}</h2>
        {text && <p className="mt-2 text-stone-600">{text}</p>}
      </div>
      {action}
    </div>
  );
}

const STEPS = [
  { title: "Validate", text: "Each value must be a proper number inside its range. One clear error is shown and nothing is scored if not." },
  { title: "Eligibility", text: "A score from 0 to 100 for how closely the application resembles ones LendingClub accepted. Below 40 is rejected." },
  { title: "Charge-off risk", text: "The probability a similar 36-month loan is not repaid, turned into an expected loss with a 50.3% loss severity." },
  { title: "Range guard", text: "Inputs outside the training range, or unusual combinations, are sent to a reviewer instead of being approved." },
  { title: "Decision", text: "Approve, review or reject. If not approved, smaller amounts are tried in $500 steps for a counter-offer." },
];

export default async function HomePage() {
  const md = await getMetadataUncachedOnFailure();
  const e = md?.metrics.eligibility;
  const c = md?.metrics.chargeoff;
  const acc = md && "summary" in md.acceptance ? (md.acceptance as Acceptance).summary : null;
  const latency = md && "checks" in md.acceptance ? (md.acceptance as Acceptance).checks.find((x) => x.name.startsWith("median response time"))?.detail : null;
  const t = md?.thresholds;

  return (
    <>
      {/* Hero */}
      <section className="border-b border-stone-200 bg-[linear-gradient(180deg,#F8F5EE_0%,#FFFFFF_100%)]">
        <div className="container-page grid items-center gap-10 py-12 md:py-16 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <div>
            <p className="text-sm font-medium text-brand">Loan eligibility screening and charge-off risk prediction</p>
            <h1 className="mt-3 text-[2.25rem] font-semibold leading-[1.15] text-navy sm:text-5xl">
              Screen a loan application from three numbers
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-stone-600">
              Enter the loan amount, FICO score and debt-to-income ratio. Two machine learning models trained on public LendingClub data
              tell you how the application fits the lender&apos;s policy and how likely it is to be repaid. A human reviewer makes the final
              call.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="/screen" variant="brand" size="lg">
                Screen an application <ArrowRight aria-hidden />
              </ButtonLink>
              <ButtonLink href="/how-it-works" variant="outline" size="lg">
                How it works
              </ButtonLink>
            </div>
            <p className="mt-4 text-sm text-stone-500">
              Want an officer&apos;s decision instead? <Link href="/apply" className="text-brand underline">Submit an application</Link>.
            </p>
          </div>

          <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">Example result</p>
            <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
              {[
                ["Loan amount", "$8,000"],
                ["FICO score", "760"],
                ["DTI", "8%"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-md bg-stone-50 p-3">
                  <dt className="text-xs text-stone-500">{k}</dt>
                  <dd className="mt-0.5 font-semibold text-navy tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-md border border-stone-200 p-3">
                <span className="flex items-center gap-2 text-sm text-stone-700"><ScanSearch className="size-4 text-brand" aria-hidden /> Eligibility tier</span>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">Likely</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-stone-200 p-3">
                <span className="flex items-center gap-2 text-sm text-stone-700"><Gauge className="size-4 text-brand" aria-hidden /> Risk tier</span>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">Low risk</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 p-3">
                <span className="flex items-center gap-2 text-sm font-medium text-emerald-900"><Check className="size-4" aria-hidden /> Decision</span>
                <span className="text-sm font-semibold text-emerald-900">Approve</span>
              </div>
            </div>
            <ButtonLink href="/screen?loan=8000&fico=760&dti=8" variant="outline" className="mt-4 w-full">
              Try it with these values
            </ButtonLink>
          </div>
        </div>
      </section>

      {/* Key figures */}
      {md && e && c && (
        <section aria-label="Key figures" className="border-b border-stone-200 bg-white">
          <div className="container-page grid grid-cols-2 md:grid-cols-4 md:divide-x md:divide-stone-200">
            {[
              [formatAuc(e.roc_auc), `eligibility AUC on ${formatNumber(e.test_rows)} held-out 2016 applications`],
              [formatAuc(c.roc_auc), `charge-off AUC on ${formatNumber(c.test_rows)} loans from 2015, a later year`],
              [`${formatPct(c.mean_predicted)} vs ${formatPct(c.mean_observed)}`, "predicted vs actual default rate in 2015"],
              [
                acc ? String(acc.passed) : "117",
                acc ? `automated acceptance checks passed (${acc.failed} failed, ${acc.warnings} warning${acc.warnings === 1 ? "" : "s"})` : "automated acceptance checks passed",
              ],
            ].map(([v, k]) => (
              <div key={k} className="py-6 md:px-6 md:first:pl-0">
                <p className="text-2xl font-semibold text-navy tabular-nums">{v}</p>
                <p className="mt-1 text-sm text-stone-600">{k}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Two questions */}
      <section className="py-16" aria-labelledby="two-heading">
        <div className="container-page">
          <SectionHeading
            id="two-heading"
            title="Two questions, two models"
            text="&quot;Will this loan be approved?&quot; is really two questions. One can be learned from accepted and rejected applications. The other only from loans that were actually funded, because nobody knows whether a rejected applicant would have repaid."
          />
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {[
              {
                icon: Split,
                title: "Eligibility model",
                q: "Does the application look like the ones LendingClub accepted?",
                points: [
                  "Trained on 100,000 accepted and 100,000 rejected applications from 2016",
                  "Score from 0 to 100, tiers Likely (75+), Borderline (40 to 75) and Unlikely (below 40)",
                  e ? `AUC ${formatAuc(e.roc_auc)}, agrees with the lender's rule on ${formatPercent(e.rule_agreement)} of applications` : "Agrees with the lender's own screening rule",
                ],
              },
              {
                icon: Gauge,
                title: "Charge-off model",
                q: "If the loan is funded, how likely is it to be charged off?",
                points: [
                  "Trained on 36-month loans issued 2012 to 2014, tested on 2015",
                  "Calibrated probability, tiers Low (up to 12%), Moderate (12 to 22%) and High (above 22%)",
                  c ? `AUC ${formatAuc(c.roc_auc)}, no risk decile off by more than ${c.max_decile_gap.toFixed(1)} points` : "Probabilities match observed default rates",
                ],
              },
            ].map((m) => (
              <article key={m.title} className="rounded-lg border border-stone-200 p-6">
                <span className="flex size-10 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <m.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-navy">{m.title}</h3>
                <p className="mt-1 text-stone-700">{m.q}</p>
                <ul className="mt-4 space-y-2 text-sm text-stone-600">
                  {m.points.map((p) => (
                    <li key={p} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden /> {p}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <p className="mt-6 text-sm text-stone-600">
            Both are histogram gradient boosting models with monotonic constraints and 3-fold sigmoid calibration. A higher FICO score can
            never make an application look riskier, and a larger loan or higher DTI can never make it look safer.
          </p>
        </div>
      </section>

      {/* Process */}
      <section className="border-y border-stone-200 bg-stone-50 py-16" aria-labelledby="process-heading">
        <div className="container-page">
          <SectionHeading
            id="process-heading"
            title="How one application is screened"
            action={
              <Link href="/how-it-works" className="text-sm font-medium text-brand hover:underline">
                Full methodology →
              </Link>
            }
          />
          <ol className="mt-8 grid gap-8 md:grid-cols-5 md:gap-6">
            {STEPS.map((s, i) => (
              <li key={s.title} className="border-t-2 border-navy pt-4">
                <p className="text-sm font-semibold text-brand tabular-nums">Step {i + 1}</p>
                <h3 className="mt-1 text-lg font-semibold text-navy">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{s.text}</p>
              </li>
            ))}
          </ol>
          {t && (
            <div className="mt-10 overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <caption className="sr-only">Decision rules</caption>
                <thead className="text-xs text-stone-500">
                  <tr>
                    <th scope="col" className="py-2 pr-4 font-medium">Decision</th>
                    <th scope="col" className="py-2 font-medium">Rule</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-stone-200">
                    <th scope="row" className="py-3 pr-4 font-semibold text-rose-800">Reject</th>
                    <td className="py-3 text-stone-700">
                      Eligibility below {t.reject_eligibility}, or expected loss above {t.reject_el}% (default probability above {t.reject_pd}%)
                    </td>
                  </tr>
                  <tr className="border-t border-stone-200">
                    <th scope="row" className="py-3 pr-4 font-semibold text-emerald-800">Approve</th>
                    <td className="py-3 text-stone-700">
                      Eligibility {t.approve_eligibility} or more, and expected loss at most {t.approve_el}% (default probability up to {t.approve_pd}%), and no range-guard flag
                    </td>
                  </tr>
                  <tr className="border-t border-stone-200">
                    <th scope="row" className="py-3 pr-4 font-semibold text-amber-800">Review</th>
                    <td className="py-3 text-stone-700">Everything else, including every flagged case</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-xs text-stone-500">These thresholds are demonstration settings, not regulatory values.</p>
            </div>
          )}
        </div>
      </section>

      {/* Audit */}
      <section className="py-16" aria-labelledby="audit-heading">
        <div className="container-page grid gap-12 lg:grid-cols-2">
          <div>
            <h2 id="audit-heading" className="text-2xl font-semibold text-navy md:text-[1.75rem]">Why our first AUC of 0.99 was wrong</h2>
            <p className="mt-4 leading-relaxed text-stone-600">
              The first eligibility model scored an AUC of 0.99. Credit screening is never that easy, so we audited it. Employment length on
              its own separated the two files, because about
              {md ? ` ${formatPercent(md.data.eligibility.rejected_emp_lt_1y_share, 0)} ` : " 91% "}
              of rejected 2016 records say &quot;&lt; 1 year&quot;. That is a difference in how the files were recorded, not a fact about the
              applicants. FICO alone also scored very high, because LendingClub&apos;s screening is close to a fixed rule.
            </p>
            <p className="mt-4 leading-relaxed text-stone-600">
              We rebuilt the system on the three inputs both files record in the same way, added monotonic constraints and calibration, and
              tested the risk model on a later year. The numbers are lower, and we know where each one comes from.
            </p>
            <Link href="/results" className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
              See the full results and audit <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <div className="grid content-start gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-stone-200 p-5">
              <ShieldCheck className="size-6 text-emerald-700" aria-hidden />
              <h3 className="mt-3 font-semibold text-navy">What LendWise does</h3>
              <ul className="mt-3 space-y-2 text-sm text-stone-600">
                {["Uses only application-time inputs", "Tests risk on a later year", "Keeps probabilities calibrated", "Checks every input before scoring"].map((x) => (
                  <li key={x} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden /> {x}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-stone-200 p-5">
              <X className="size-6 text-rose-700" aria-hidden />
              <h3 className="mt-3 font-semibold text-navy">What it does not do</h3>
              <ul className="mt-3 space-y-2 text-sm text-stone-600">
                {["Make lending decisions on its own", "Give the real chance of approval", "Judge FICO below 660 reliably", "Work on Indian data without retraining"].map((x) => (
                  <li key={x} className="flex gap-2">
                    <X className="mt-0.5 size-4 shrink-0 text-rose-700" aria-hidden /> {x}
                  </li>
                ))}
              </ul>
            </div>
            {latency && (
              <p className="text-sm text-stone-600 sm:col-span-2">
                Speed: {latency.replace("median", "median response").replace("over 200 requests", "per application")}.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-stone-200 bg-stone-50 py-16" aria-labelledby="faq-heading">
        <div className="container-page grid gap-10 lg:grid-cols-[1fr_2fr]">
          <div>
            <h2 id="faq-heading" className="text-2xl font-semibold text-navy md:text-[1.75rem]">Frequently asked questions</h2>
            <p className="mt-3 text-stone-600">
              More in the{" "}
              <Link href="/faq" className="text-brand underline underline-offset-2 hover:text-brand-deep">FAQ</Link>, or{" "}
              <Link href="/contact" className="text-brand underline underline-offset-2 hover:text-brand-deep">contact us</Link>.
            </p>
          </div>
          <FaqList items={FAQS.slice(0, 5)} />
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-brand-line bg-brand-soft">
        <div className="container-page flex flex-col items-start justify-between gap-6 py-12 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-semibold text-navy">Try it with your own numbers</h2>
            <p className="mt-2 text-stone-600">Screening takes a few milliseconds, and nothing you type is stored.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/screen" variant="brand" size="lg">
              Screen an application
            </ButtonLink>
            <ButtonLink href="/results" variant="outline" size="lg">
              See the results
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
