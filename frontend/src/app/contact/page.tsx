import type { Metadata } from "next";
import { PageHeader } from "@/components/site/page-header";
import { ContactForm } from "@/components/site/contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the LendWise team.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <>
      <PageHeader eyebrow="Contact" title="We’re here to help" description="Questions about an application, the model or this demo? Send us a message." />
      <section className="container-page grid gap-10 py-16 lg:grid-cols-[1fr_1.5fr]">
        <div>
          <h2 className="border-b border-stone-200 pb-3 text-xl font-semibold text-navy">Customer support</h2>
          <dl className="divide-y divide-stone-200 text-sm">
            {[
              ["Email", "support@lendwise.demo"],
              ["Hours", "Monday to Saturday, 9:30 am – 6:30 pm IST"],
              ["Response time", "Within two business days"],
              ["Office", "Bengaluru, Karnataka, India"],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[8rem_1fr] gap-4 py-3.5">
                <dt className="font-medium text-stone-900">{k}</dt>
                <dd className="text-stone-600">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 border-l-4 border-l-brand bg-stone-50 p-4 text-sm text-stone-600">
            Messages go straight to the LendWise officer inbox. For data-deletion requests, choose the topic “Privacy”, include your application
            ID and write from the email you applied with.
          </p>
        </div>
        <ContactForm />
      </section>
    </>
  );
}
