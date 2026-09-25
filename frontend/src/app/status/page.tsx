import type { Metadata } from "next";
import { StatusLookup } from "@/components/decision/status-lookup";
import { PageHeader } from "@/components/site/page-header";

export const metadata: Metadata = {
  title: "Check application status",
  description: "Look up your LendWise loan decision with your application ID and email address.",
  alternates: { canonical: "/status" },
};

export default async function StatusPage(props: PageProps<"/status">) {
  const sp = await props.searchParams;
  const raw = typeof sp.id === "string" ? sp.id.trim().toUpperCase() : "";
  const defaultId = /^LW-\d{4}-\d{6}$/.test(raw) ? raw : undefined;
  return (
    <>
      <PageHeader
        eyebrow="Application status"
        title="Check your application status"
        description="Enter the application ID from your decision page or letter, along with the email address you applied with."
      />
      <div className="bg-stone-50">
        <div className="container-page py-10 md:py-14">
          <StatusLookup defaultId={defaultId} />
        </div>
      </div>
    </>
  );
}
