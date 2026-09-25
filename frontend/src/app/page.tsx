import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { ButtonLink } from "@/components/site/button-link";
import { EmiCalculator } from "@/components/home/emi-calculator";
import { FaqList } from "@/components/site/faq-list";
import { getMetadataUncachedOnFailure } from "@/lib/backend";
import { FAQS } from "@/lib/faq";
import { formatNumber, formatPercent } from "@/lib/format";
import { charges, DOCUMENTS, ELIGIBILITY, PRODUCTS } from "@/lib/products";

export const revalidate = 300;

const STEPS = [
  { title: "Apply online", text: "Five short sections covering your details, work, residence and the loan you need. About three minutes." },
  { title: "Risk assessment", text: "Your profile is converted into 414 model features and scored by a Random Forest risk model." },
  { title: "Decision", text: "You see the outcome on screen straight away, with the risk band and the main factors behind it." },
  { title: "Next steps", text: "Download your decision letter, and track your application at any time with its ID." },
];

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

export default async function HomePage() {
  const md = await getMetadataUncachedOnFailure();
  const rate = md?.interest_rate ?? 10.5;
  const accuracy = md ? formatPercent(md.metrics.accuracy) : "89.3%";

  return (
    <>
      {/* Hero */}
      <section className="border-b border-stone-200 bg-[linear-gradient(180deg,#F8F5EE_0%,#FFFFFF_100%)]">
        <div className="container-page grid items-start gap-10 py-12 md:py-16 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <div className="lg:pt-6">
            <p className="text-sm font-medium text-brand">Personal, home, vehicle, education and business loans</p>
            <h1 className="mt-3 text-[2.25rem] font-semibold leading-[1.15] text-navy sm:text-5xl">
              Loans up to ₹1 crore, with a decision in under a minute
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-stone-600">
              Apply online in about three minutes. We assess your profile with a risk model trained on 2.5 lakh past applications and show
              you the outcome immediately, along with the reasons.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="/apply" variant="brand" size="lg">
                Apply now <ArrowRight aria-hidden />
              </ButtonLink>
              <ButtonLink href="#eligibility" variant="outline" size="lg">
                Check eligibility
              </ButtonLink>
            </div>

            <dl className="mt-10 grid grid-cols-2 border-y border-stone-200 sm:grid-cols-4">
              {[
                ["Interest rate", `From ${rate}% p.a.*`],
                ["Loan amount", "Up to ₹1 crore"],
                ["Tenure", "6 – 360 months"],
                ["Processing fee", "Nil*"],
              ].map(([k, v], i) => (
                <div key={k} className={`py-4 ${i % 2 === 1 ? "pl-4" : ""} ${i > 0 ? "sm:border-l sm:border-stone-200 sm:pl-4" : ""}`}>
                  <dt className="text-xs text-stone-500">{k}</dt>
                  <dd className="mt-1 text-base font-semibold text-navy">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-stone-500">
              *Indicative terms. See{" "}
              <Link href="/rates" className="underline hover:text-navy">
                rates &amp; charges
              </Link>
              .
            </p>
          </div>

          <EmiCalculator defaultRate={rate} />
        </div>
      </section>

      {/* Key figures */}
      <section aria-label="Key figures" className="border-b border-stone-200 bg-white">
        <div className="container-page grid grid-cols-2 md:grid-cols-4 md:divide-x md:divide-stone-200">
          {[
            [accuracy, "model accuracy on 50,400 held-out applications"],
            [md ? formatNumber(md.training_rows) : "2,52,000", "historical applications used to train the model"],
            ["Under 1 min", "typical time from submission to decision"],
            ["No documents", "needed to receive a decision online"],
          ].map(([v, k]) => (
            <div key={k} className="py-6 md:px-6 md:first:pl-0">
              <p className="text-2xl font-semibold text-navy tabular-nums">{v}</p>
              <p className="mt-1 text-sm text-stone-600">{k}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Products */}
      <section id="products" className="scroll-mt-28 py-16" aria-labelledby="products-heading">
        <div className="container-page">
          <SectionHeading
            id="products-heading"
            title="Choose a loan"
            text="Every loan is assessed on your applicant profile. The purpose is recorded with your application but does not change the decision."
            action={
              <Link href="/rates" className="text-sm font-medium text-brand hover:underline">
                Rates &amp; charges →
              </Link>
            }
          />
          <ul className="divide-y divide-stone-200 md:hidden">
            {PRODUCTS.map((p) => (
              <li key={p.purpose} className="py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-navy">{p.name}</h3>
                    <p className="mt-0.5 text-sm text-stone-600">{p.use}</p>
                  </div>
                  <ButtonLink href={`/apply?purpose=${p.purpose}`} variant="outline" size="sm" aria-label={`Apply for a ${p.name.toLowerCase()}`}>
                    Apply
                  </ButtonLink>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-stone-500">Amount</dt>
                    <dd className="mt-0.5 font-medium text-stone-800">{p.amount}</dd>
                  </div>
                  <div>
                    <dt className="text-stone-500">Tenure</dt>
                    <dd className="mt-0.5 font-medium text-stone-800">{p.tenure}</dd>
                  </div>
                  <div>
                    <dt className="text-stone-500">Rate</dt>
                    <dd className="mt-0.5 font-medium text-stone-800">From {rate}% p.a.</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
          <div className="relative hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Loan products</caption>
              <thead>
                <tr className="text-xs text-stone-500">
                  <th scope="col" className="py-3 pr-4 font-medium">Product</th>
                  <th scope="col" className="py-3 pr-4 font-medium">Loan amount</th>
                  <th scope="col" className="py-3 pr-4 font-medium">Tenure</th>
                  <th scope="col" className="py-3 pr-4 font-medium">Interest rate</th>
                  <th scope="col" className="py-3">
                    <span className="sr-only">Apply</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {PRODUCTS.map((p) => (
                  <tr key={p.purpose} className="border-t border-stone-200 align-top">
                    <th scope="row" className="py-5 pr-4 font-normal">
                      <span className="block font-semibold text-navy">{p.name}</span>
                      <span className="mt-0.5 block text-stone-600">{p.use}</span>
                    </th>
                    <td className="whitespace-nowrap py-5 pr-4 text-stone-800">{p.amount}</td>
                    <td className="whitespace-nowrap py-5 pr-4 text-stone-800">{p.tenure}</td>
                    <td className="whitespace-nowrap py-5 pr-4 text-stone-800">From {rate}% p.a.</td>
                    <td className="py-4 text-right">
                      <ButtonLink href={`/apply?purpose=${p.purpose}`} variant="outline" size="sm" aria-label={`Apply for a ${p.name.toLowerCase()}`}>
                        Apply
                      </ButtonLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="border-y border-stone-200 bg-stone-50 py-16" aria-labelledby="process-heading">
        <div className="container-page">
          <SectionHeading
            id="process-heading"
            title="How your application is decided"
            action={
              <Link href="/how-it-works" className="text-sm font-medium text-brand hover:underline">
                Read the full methodology →
              </Link>
            }
          />
          <ol className="mt-8 grid gap-8 md:grid-cols-4 md:gap-6">
            {STEPS.map((s, i) => (
              <li key={s.title} className="border-t-2 border-navy pt-4">
                <p className="text-sm font-semibold text-brand tabular-nums">Step {i + 1}</p>
                <h3 className="mt-1 text-lg font-semibold text-navy">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Eligibility & documents */}
      <section id="eligibility" className="scroll-mt-28 py-16" aria-labelledby="eligibility-heading">
        <div className="container-page grid gap-12 lg:grid-cols-2">
          <div>
            <h2 id="eligibility-heading" className="border-b border-stone-200 pb-4 text-2xl font-semibold text-navy">
              Eligibility
            </h2>
            <dl className="divide-y divide-stone-200">
              {ELIGIBILITY.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-4 py-3.5 text-sm">
                  <dt className="font-medium text-stone-900">{k}</dt>
                  <dd className="text-stone-600">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <h2 className="border-b border-stone-200 pb-4 text-2xl font-semibold text-navy">Documents for disbursal</h2>
            <dl className="divide-y divide-stone-200">
              {DOCUMENTS.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-4 py-3.5 text-sm">
                  <dt className="font-medium text-stone-900">{k}</dt>
                  <dd className="text-stone-600">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-sm text-stone-600">You don’t need to upload anything to get a decision. Documents are only needed after approval.</p>
          </div>
        </div>
      </section>

      {/* Rates & charges + security */}
      <section className="border-t border-stone-200 bg-stone-50 py-16" aria-labelledby="charges-heading">
        <div className="container-page grid gap-12 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <SectionHeading
              id="charges-heading"
              title="Rates & charges"
              action={
                <Link href="/rates" className="text-sm font-medium text-brand hover:underline">
                  Full schedule →
                </Link>
              }
            />
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Summary of rates and charges</caption>
              <tbody>
                {charges(rate)
                  .slice(0, 5)
                  .map(([k, v]) => (
                    <tr key={k} className="border-b border-stone-200">
                      <th scope="row" className="py-3 pr-4 font-medium text-stone-900">{k}</th>
                      <td className="py-3 text-stone-700">{v}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-stone-500">All terms are indicative.</p>
          </div>
          <div>
            <h2 className="border-b border-stone-200 pb-4 text-2xl font-semibold text-navy">Security &amp; privacy</h2>
            <ul className="mt-4 space-y-3 text-sm text-stone-700">
              {[
                "All connections are encrypted with TLS and protected by strict security headers.",
                "Your decision page opens only in the browser you applied from, or with your application ID and email.",
                "The risk model runs on our servers. Your browser only ever receives the result.",
                "We never sell or share your data for marketing.",
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
            <Link href="/privacy" className="mt-5 inline-block text-sm font-medium text-brand hover:underline">
              Privacy policy →
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16" aria-labelledby="faq-heading">
        <div className="container-page grid gap-10 lg:grid-cols-[1fr_2fr]">
          <div>
            <h2 id="faq-heading" className="text-2xl font-semibold text-navy md:text-[1.75rem]">
              Frequently asked questions
            </h2>
            <p className="mt-3 text-stone-600">
              More answers in the{" "}
              <Link href="/faq" className="text-brand underline underline-offset-2 hover:text-brand-deep">
                help centre
              </Link>
              , or{" "}
              <Link href="/contact" className="text-brand underline underline-offset-2 hover:text-brand-deep">
                contact us
              </Link>
              .
            </p>
          </div>
          <FaqList items={FAQS.slice(0, 5)} />
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-brand-line bg-brand-soft">
        <div className="container-page flex flex-col items-start justify-between gap-6 py-12 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-semibold text-navy">Find out where you stand in three minutes</h2>
            <p className="mt-2 text-stone-600">Checking your decision doesn’t commit you to anything.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/apply" variant="brand" size="lg">
              Start application
            </ButtonLink>
            <ButtonLink href="/status" variant="outline" size="lg">
              Track application
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
