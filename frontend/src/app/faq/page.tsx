import type { Metadata } from "next";
import { PageHeader } from "@/components/site/page-header";
import { ButtonLink } from "@/components/site/button-link";
import { FaqList } from "@/components/site/faq-list";
import { FAQS } from "@/lib/faq";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers to common questions about LendWise applications, decisions and privacy.",
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  const categories = ["General", "Decision", "Privacy"] as const;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <PageHeader eyebrow="Help centre" title="Frequently asked questions" description="Everything you need to know about applying, decisions and your data." />
      <section className="container-page max-w-4xl space-y-10 py-16">
        {categories.map((c) => (
          <div key={c}>
            <h2 className="text-lg font-semibold text-navy">{c}</h2>
            <FaqList className="mt-3" items={FAQS.filter((f) => f.category === c)} />
          </div>
        ))}
        <div className="rounded-lg bg-stone-50 p-6 text-center">
          <p className="font-medium text-navy">Still have questions?</p>
          <ButtonLink href="/contact" variant="default" className="mt-4">Contact us</ButtonLink>
        </div>
      </section>
    </>
  );
}
