import type { Metadata } from "next";
import { PageHeader } from "@/components/site/page-header";
import { ButtonLink } from "@/components/site/button-link";
import { Disclaimer } from "@/components/site/disclaimer";
import { PROJECT } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description: "LendWise is a B.Tech project on loan eligibility screening and charge-off risk prediction using machine learning.",
  alternates: { canonical: "/about" },
};

const OBJECTIVES = [
  "Prepare two clean datasets from the LendingClub files, one for screening and one for risk.",
  "Train an eligibility model that gives a score from 0 to 100.",
  "Train a charge-off model on loans from 2012 to 2014 and test it on loans from 2015.",
  "Use only the three inputs both files share, and keep the models monotonic and calibrated.",
  "Audit the data and find out where the AUC of 0.99 came from.",
  "Build an input validator, simple decision rules and an interface.",
  "Write an automated test suite that checks the models and the interface code.",
];

const FUTURE = [
  "Add credit history and loan grade to the risk model.",
  "Recalibrate the eligibility score to the real acceptance rate of about 8%.",
  "Add a logistic regression baseline with bootstrap confidence intervals.",
  "Test on recent data and on data from other regions, including Indian bureau data such as CIBIL.",
  "Show SHAP explanations for each result so a reviewer can see why a score was given.",
  "Carry out a fairness and adverse-impact analysis before any use on real people.",
];

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="About"
        title="About LendWise"
        description={PROJECT.title}
      />
      <section className="container-page grid gap-12 py-16 lg:grid-cols-2">
        <div className="space-y-4 leading-relaxed text-stone-700">
          <h2 className="text-2xl font-semibold text-navy">The project</h2>
          <p>
            Screening a loan application is one of the first and most important steps in lending. A lender has to decide whether the
            application fits its policy and how likely the borrower is to repay. LendWise is a screening prototype built on the public
            LendingClub data, which contains both the loans that were funded and the applications that were rejected.
          </p>
          <p>
            It started from credit-risk notebooks that predicted repayment with a random 80:20 split. Reviewing that setup, we noticed it
            predicted repayment and not approval. Our next model, trained on accepted versus rejected applications, reached an AUC of 0.99,
            and an audit showed this came mainly from how the two files were recorded. That became the turning point: instead of pushing the
            score higher, we built something whose results we could defend.
          </p>
          <p>
            The final system pairs two monotonic, calibrated gradient boosting models with an input validator, decision rules based on
            expected loss, a range guard, a counter-offer search, this website with an officer dashboard, and an automated acceptance suite.
            It is meant to assist a human reviewer, not to make real lending decisions on its own.
          </p>
          <h3 className="pt-4 text-lg font-semibold text-navy">Objectives</h3>
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            {OBJECTIVES.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </div>
        <div className="space-y-8">
          <div className="rounded-lg border border-stone-200 p-6">
            <h2 className="text-lg font-semibold text-navy">Team</h2>
            <ul className="mt-3 space-y-1.5 text-stone-700">
              {PROJECT.team.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <dl className="mt-5 space-y-3 border-t border-stone-200 pt-4 text-sm">
              <div>
                <dt className="text-stone-500">Mentor</dt>
                <dd className="font-medium text-stone-900">{PROJECT.mentor}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Head of department</dt>
                <dd className="font-medium text-stone-900">{PROJECT.hod}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Institution</dt>
                <dd className="font-medium text-stone-900">
                  {PROJECT.department}, {PROJECT.college}
                </dd>
              </div>
              <div>
                <dt className="text-stone-500">University</dt>
                <dd className="font-medium text-stone-900">{PROJECT.university}</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-lg border border-stone-200 p-6">
            <h2 className="text-lg font-semibold text-navy">Future directions</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-stone-700">
              {FUTURE.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <section className="container-page pb-16">
        <Disclaimer />
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/how-it-works" variant="default">How it works</ButtonLink>
          <ButtonLink href="/results" variant="outline">Results</ButtonLink>
          <a href={PROJECT.repo} className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-stone-50">
            Source code on GitHub
          </a>
        </div>
      </section>
    </>
  );
}
