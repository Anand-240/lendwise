import type { Metadata } from "next";
import { PageHeader } from "@/components/site/page-header";
import { ButtonLink } from "@/components/site/button-link";
import { Disclaimer } from "@/components/site/disclaimer";

export const metadata: Metadata = {
  title: "About",
  description: "LendWise is an educational demo of transparent, ML-powered loan decisions.",
  alternates: { canonical: "/about" },
};

const VALUES = [
  { title: "Transparency", text: "We show what the model uses, how it performs and where it falls short." },
  { title: "Speed with care", text: "Instant decisions, delivered respectfully — especially when the answer is no." },
  { title: "Human oversight", text: "Automation assists; loan officers can always review and override." },
  { title: "Education first", text: "LendWise exists to demonstrate responsible ML in lending, not to issue credit." },
];

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="About LendWise"
        title="Making automated lending decisions understandable"
        description="LendWise is a demonstration platform that shows how a machine-learning risk model can power instant loan decisions — and how to present them honestly."
      />
      <section className="container-page grid gap-12 py-16 lg:grid-cols-2">
        <div className="space-y-4 text-stone-700">
          <h2 className="text-2xl font-semibold text-navy">Our story</h2>
          <p>
            LendWise began as a data-science project exploring loan default prediction on a dataset of 252,000 applicant profiles. We engineered features,
            compared several models and selected a tuned Random Forest that balances catching risky profiles with approving good ones.
          </p>
          <p>
            We then wrapped that model in a complete digital lending experience — application, instant decision, decision letter, status tracking and an
            officer dashboard — to show what a responsible, end-to-end ML product looks like.
          </p>
          <p>
            Every decision screen is honest about what the model does and doesn’t consider. Loan amount, for instance, is recorded but is not a model input.
          </p>
        </div>
        <div>
          <h2 className="border-b border-stone-200 pb-3 text-2xl font-semibold text-navy">What we stand for</h2>
          <dl className="divide-y divide-stone-200">
            {VALUES.map((v) => (
              <div key={v.title} className="py-4">
                <dt className="font-semibold text-navy">{v.title}</dt>
                <dd className="mt-1 text-sm text-stone-600">{v.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <section className="container-page pb-16">
        <Disclaimer />
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/how-it-works" variant="default">See how it works</ButtonLink>
          <ButtonLink href="/contact" variant="outline">Get in touch</ButtonLink>
        </div>
      </section>
    </>
  );
}
