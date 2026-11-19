import type { Metadata } from "next";
import { CheckCircle2, CircleAlert, XCircle } from "lucide-react";
import { PageHeader } from "@/components/site/page-header";
import { ServiceUnavailable } from "@/components/site/service-unavailable";
import { AuditChart, CalibrationChart } from "@/components/results/charts";
import { getMetadataUncachedOnFailure } from "@/lib/backend";
import { formatAuc, formatDate, formatNumber, formatPct, formatPercent } from "@/lib/format";
import type { Acceptance, Evaluation } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Results and audit",
  description:
    "Every LendWise number: eligibility and charge-off metrics, calibration by risk group, constraint variants, the audit of the 0.99 AUC, twelve algorithms and the acceptance test suite.",
  alternates: { canonical: "/results" },
};
export const revalidate = 300;

function H2({ id, children, text }: { id: string; children: React.ReactNode; text?: React.ReactNode }) {
  return (
    <div className="max-w-3xl">
      <h2 id={id} className="text-2xl font-semibold text-navy">{children}</h2>
      {text && <div className="mt-2 leading-relaxed text-stone-600">{text}</div>}
    </div>
  );
}

function Table({
  caption,
  head,
  rows,
  mono = [],
  nowrapFirst = false,
}: {
  caption: string;
  head: string[];
  rows: React.ReactNode[][];
  mono?: number[];
  nowrapFirst?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-stone-50 text-xs text-stone-500">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-3 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-stone-100">
              {r.map((c, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className={cn("px-4 py-3 font-medium text-stone-900", nowrapFirst && "whitespace-nowrap")}>{c}</th>
                ) : (
                  <td key={j} className={cn("px-4 py-3 text-stone-700", mono.includes(j) && "tabular-nums")}>{c}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_ICON = {
  PASS: <CheckCircle2 className="size-4 text-emerald-700" aria-label="Passed" />,
  WARN: <CircleAlert className="size-4 text-amber-600" aria-label="Warning" />,
  FAIL: <XCircle className="size-4 text-rose-700" aria-label="Failed" />,
};

export default async function ResultsPage() {
  const md = await getMetadataUncachedOnFailure();
  if (!md) {
    return (
      <div className="bg-stone-50">
        <div className="container-page py-16">
          <ServiceUnavailable message="The model card could not be loaded right now. Please try again in a few minutes." />
        </div>
      </div>
    );
  }
  const e = md.metrics.eligibility;
  const c = md.metrics.chargeoff;
  const ev = "variants" in md.evaluation ? (md.evaluation as Evaluation) : null;
  const acc = "summary" in md.acceptance ? (md.acceptance as Acceptance) : null;
  const groups = acc ? Array.from(new Set(acc.checks.map((x) => x.group))) : [];

  return (
    <>
      <PageHeader
        eyebrow="Results"
        title="Results, audit and tests"
        description="Every number on this page is computed by the project's scripts from the saved models and the LendingClub data, and is served live from the model card."
      />

      <section className="container-page space-y-6 py-14" aria-labelledby="main-results">
        <H2 id="main-results" text={<>Eligibility is measured on a random 20% hold-out of the 2016 sample; charge-off on loans from 2015, a year the model never saw.</>}>
          Results of the two models
        </H2>
        <Table
          caption="Results of the two models"
          head={["Metric", "Value"]}
          mono={[1]}
          rows={[
            [<span key="h1" className="text-xs font-semibold tracking-wide text-stone-500 uppercase">Eligibility model (2016 hold-out)</span>, ""],
            ["ROC AUC", formatAuc(e.roc_auc)],
            ["Accuracy / precision / recall at 50%", `${e.accuracy.toFixed(3)} / ${e.precision.toFixed(3)} / ${e.recall.toFixed(3)}`],
            [`Agreement with rule FICO ≥ 660, DTI ≤ 35, loan < $40,000`, formatPercent(e.rule_agreement)],
            ["Accuracy of that rule on its own", e.rule_accuracy.toFixed(3)],
            [<span key="h2" className="text-xs font-semibold tracking-wide text-stone-500 uppercase">Charge-off model (2015 test)</span>, ""],
            ["ROC AUC", formatAuc(c.roc_auc)],
            ["Mean predicted vs actual default rate", `${formatPct(c.mean_predicted)} vs ${formatPct(c.mean_observed)}`],
            ["Brier score: model vs base rate", `${c.brier.toFixed(4)} vs ${c.brier_base_rate.toFixed(4)}`],
            ["Largest calibration gap across deciles", `${c.max_decile_gap.toFixed(1)} percentage points`],
          ]}
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3 text-sm leading-relaxed text-stone-700">
            <p>
              <strong className="text-navy">The eligibility model has learned LendingClub&apos;s rule.</strong> A simple rule (FICO at least
              660, DTI at most 35, loan below $40,000) scores an accuracy of {e.rule_accuracy.toFixed(3)} on its own, and the model agrees
              with it on {formatPercent(e.rule_agreement)} of applications. For a {`$${formatNumber(e.fico_659_vs_660.loan_amount)}`} loan
              with DTI {e.fico_659_vs_660.dti}, the score jumps from {e.fico_659_vs_660.fico_659.toFixed(1)} at FICO 659 to{" "}
              {e.fico_659_vs_660.fico_660.toFixed(1)} at FICO 660. It applies the rule consistently, but makes no independent judgment.
            </p>
            <p>
              <strong className="text-navy">The charge-off model ranks modestly but its probabilities are good.</strong> An AUC of{" "}
              {c.roc_auc.toFixed(3)} means that of one charged-off and one repaid loan picked at random, it gives the charged-off one the
              higher risk about {Math.round(c.roc_auc * 100)}% of the time. Predicted and actual default rates rise together across the ten
              groups, from {formatPct(c.deciles[0].predicted)} predicted and {formatPct(c.deciles[0].observed)} actual in the safest group to{" "}
              {formatPct(c.deciles[9].predicted)} and {formatPct(c.deciles[9].observed)} in the riskiest. It slightly underestimates risk for
              the riskiest loans, by at most {c.max_decile_gap.toFixed(1)} points.
            </p>
          </div>
          <CalibrationChart deciles={c.deciles} />
        </div>
      </section>

      {ev && (
        <>
          <section className="border-y border-stone-200 bg-stone-50 py-14" aria-labelledby="limit-heading">
            <div className="container-page space-y-6">
              <H2
                id="limit-heading"
                text={
                  <>
                    Twelve algorithms on the same three inputs all land between {formatAuc(ev.algorithms_range.min)} and{" "}
                    {formatAuc(ev.algorithms_range.max)}.
                    {ev.extended_inputs && <> Adding income, credit history and other bureau fields raises the AUC to {formatAuc(ev.extended_inputs.auc)} with the same method.</>}{" "}
                    The limit comes from the inputs, not the algorithm.
                  </>
                }
              >
                Where the charge-off limit comes from
              </H2>
              <div className="grid gap-6 lg:grid-cols-2">
                <Table
                  caption="Charge-off AUC by algorithm"
                  head={["Algorithm (2015 test)", "AUC"]}
                  mono={[1]}
                  rows={[...ev.algorithms].sort((a, b) => b.auc - a.auc).map((a) => [a.algorithm, formatAuc(a.auc)])}
                />
                <Table
                  caption="Charge-off AUC inside smaller groups"
                  head={["Group", "Loans", "Default rate", "AUC"]}
                  mono={[1, 2, 3]}
                  rows={ev.subgroups.map((s) => [`${s.group} ${s.band}`, formatNumber(s.rows), formatPct(s.default_rate), formatAuc(s.auc)])}
                />
              </div>
              <p className="text-sm text-stone-600">
                AUC is lowest inside FICO bands, which makes sense because FICO hardly changes inside a band. The average loss on a charged-off
                loan is {formatPercent(ev.severity.mean_severity)}; a regression model for severity changed R² by only{" "}
                {ev.severity.r2_gain.toFixed(3)}, so the average is used.
              </p>
            </div>
          </section>

          <section className="container-page space-y-6 py-14" aria-labelledby="variants-heading">
            <H2
              id="variants-heading"
              text={
                <>
                  Constraints and regularisation trade a little eligibility AUC for far fewer jumpy profiles: profiles whose score moves by
                  more than {ev.nudge.eligibility_limit} points (eligibility) or {ev.nudge.risk_limit} points (risk) when the loan amount moves
                  by 1%, FICO by 1 point or DTI by 0.5. Variant C is the one LendWise uses.
                </>
              }
            >
              Comparison of variants
            </H2>
            <Table
              caption="Comparison of variants"
              head={["Variant", "Eligibility AUC", "Jumpy", "Charge-off AUC", "Jumpy"]}
              mono={[1, 2, 3, 4]}
              rows={ev.variants.map((v) => [
                <span key={v.variant} className={cn(v.variant === "C" && "text-brand-deep")}>{v.variant} {v.label}</span>,
                formatAuc(v.eligibility_auc),
                formatPercent(v.eligibility_jumpy),
                formatAuc(v.chargeoff_auc),
                formatPercent(v.chargeoff_jumpy),
              ])}
            />
            <p className="text-sm text-stone-600">
              Behaviour checks: each of the three inputs is swept across its range at four reference profiles, for both models, which gives{" "}
              {ev.behaviour.checks} checks. A check fails if the score moves against the expected direction by more than 1 point. The
              unconstrained baseline (A) failed {ev.behaviour.unconstrained_failed} of them and the constrained models (C) failed{" "}
              {ev.behaviour.constrained_failed}. A risk estimate that rises when the loan gets smaller would be very hard to justify to anyone.
            </p>
          </section>

          <section className="border-y border-stone-200 bg-stone-50 py-14" aria-labelledby="audit-heading">
            <div className="container-page grid gap-8 lg:grid-cols-[1fr_1.2fr]">
              <H2
                id="audit-heading"
                text={
                  <>
                    <p>
                      The first eligibility model scored an AUC of {ev.audit.rows[0].auc.toFixed(3)}. Retraining it with different inputs shows
                      where that came from. Both files were already matched to 2016, so the time period was not the reason.
                    </p>
                    <p className="mt-3">
                      Employment length on its own reaches {ev.audit.rows.find((r) => r.label.startsWith("Employment"))?.auc.toFixed(4)}, because{" "}
                      {formatPercent(ev.audit.rejected_emp_lt_1y_share)} of rejected 2016 records say &quot;&lt; 1 year&quot; against{" "}
                      {formatPercent(ev.audit.accepted_emp_lt_1y_share)} of accepted loans. FICO alone reaches{" "}
                      {ev.audit.rows.find((r) => r.label === "FICO alone")?.auc.toFixed(4)}, because the lender&apos;s screening is close to a
                      fixed rule. Loan purpose added only {ev.audit.purpose_adds.toFixed(3)}.
                    </p>
                    {ev.audit.fico_multiple_of_5 && (
                      <p className="mt-3">
                        FICO is recorded differently as well. Every accepted loan stores the low end of a 5-point range (660, 665 and so on),
                        so {formatPercent(ev.audit.fico_multiple_of_5.accepted, 0)} of accepted FICO values end in 0 or 5, against{" "}
                        {formatPercent(ev.audit.fico_multiple_of_5.rejected)} of rejected ones. Without constraints the model uses this: a{" "}
                        $5,000 loan with DTI 10 scores {ev.audit.fico_multiple_of_5.unconstrained_700.toFixed(1)} at FICO 700 but{" "}
                        {ev.audit.fico_multiple_of_5.unconstrained_701.toFixed(1)} at FICO 701. The monotonic constraint rules this out.
                      </p>
                    )}
                    <p className="mt-3">
                      The same three inputs without constraints reach {ev.audit.three_inputs_unconstrained.toFixed(4)}; the constrained,
                      regularised model reaches {e.roc_auc.toFixed(4)}.
                    </p>
                  </>
                }
              >
                Audit of the 0.99 AUC
              </H2>
              <AuditChart rows={ev.audit.rows} />
            </div>
          </section>
        </>
      )}

      {acc && (
        <section className="container-page space-y-6 py-14" aria-labelledby="tests-heading">
          <H2
            id="tests-heading"
            text={
              <>
                The acceptance suite runs on the saved models and the real interface code. It checks {acc.summary.bad_values} bad input
                values, a grid of {formatNumber(acc.summary.grid_size)} valid inputs for monotonic behaviour, the policy thresholds, single vs
                batch scoring, extreme cases, stability, the reported metrics and end-to-end runs of the interface. Last run{" "}
                {formatDate(acc.summary.run_at, true)}: <strong className="text-navy">{acc.summary.passed} passed</strong>,{" "}
                {acc.summary.failed} failed and {acc.summary.warnings} warning{acc.summary.warnings === 1 ? "" : "s"}, in{" "}
                {Math.round(acc.summary.seconds)} seconds.
              </>
            }
          >
            Acceptance tests
          </H2>
          <Table
            caption="Test cases"
            nowrapFirst
            head={["ID", "Input or action", "Expected", "Actual", "Status"]}
            rows={acc.test_cases.map((t) => [t.id, t.input, t.expected, t.actual, t.status])}
          />
          <p className="text-sm text-stone-600">
            The one warning is expected: the raw models accept NaN and infinity without complaining, so the validator must always sit in front
            of them, and it does.
          </p>
          <div className="space-y-3">
            {groups.map((g) => {
              const items = acc.checks.filter((x) => x.group === g);
              const passed = items.filter((x) => x.status === "PASS").length;
              return (
                <details key={g} className="group rounded-lg border border-stone-200 bg-white">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 [&::-webkit-details-marker]:hidden">
                    <span className="font-medium text-navy">{g}</span>
                    <span className="text-sm text-stone-600 tabular-nums">
                      {passed} of {items.length} passed
                    </span>
                  </summary>
                  <ul className="divide-y divide-stone-100 border-t border-stone-100 text-sm">
                    {items.map((x) => (
                      <li key={x.id} className="flex gap-3 px-4 py-2.5">
                        <span className="mt-0.5 shrink-0">{STATUS_ICON[x.status]}</span>
                        <span className="min-w-0">
                          <span className="text-stone-900">{x.name}</span>
                          <span className="block break-words text-xs text-stone-500">{x.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
          </div>
        </section>
      )}

      <section className="border-t border-stone-200 bg-stone-50 py-14" aria-labelledby="compare-heading">
        <div className="container-page space-y-6">
          <H2 id="compare-heading" text="LendWise does not claim to be more accurate than published models. Many report very high accuracy on LendingClub data, but they predict something slightly different, split the data at random and use fields only known after the loan is issued. Our own first model reached 0.99 for the same reasons. So we compare the approach instead.">
            Comparison
          </H2>
          <div className="grid gap-6 lg:grid-cols-2">
            <Table
              caption="Comparison of approach"
              head={["Aspect", "Common practice", "LendWise"]}
              rows={[
                ["Inputs", "Many, sometimes from after the loan", "Three application-time inputs"],
                ["Data split", "Random", "By year for the risk model"],
                ["Class imbalance", "Oversampling (SMOTE)", "Natural rate with calibration"],
                ["Behaviour checks", "Rarely done", "Monotonic constraints and nudge tests"],
                ["Data audit", "Rarely done", "Audit of the 0.99 AUC"],
                ["Delivered as", "Model only", "Validator, rules, website and test suite"],
              ]}
            />
            <Table
              caption="Comparison with manual screening"
              head={["Feature", "Manual screening", "LendWise"]}
              rows={[
                ["Speed", "Minutes to days", "Milliseconds per application"],
                ["Consistency", "Can differ between officers", "Same input always gives the same output"],
                ["Risk estimate", "Based on judgment", "Calibrated default probability"],
                ["Counter-offer", "Worked out by hand", "Automatic search in $500 steps"],
                ["Input checking", "Manual", "Validator and range guard"],
              ]}
            />
          </div>
        </div>
      </section>
    </>
  );
}
