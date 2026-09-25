import type { Metadata } from "next";
import { cookies } from "next/headers";
import { DecisionView } from "@/components/decision/decision-view";
import { StatusLookup } from "@/components/decision/status-lookup";
import { ServiceUnavailable } from "@/components/site/service-unavailable";
import { appCookieName, backendFetch, BackendUnavailable } from "@/lib/backend";
import type { ApplicationResult } from "@/lib/types";

export const metadata: Metadata = {
  title: "Your loan decision",
  robots: { index: false, follow: false },
};

async function load(id: string): Promise<ApplicationResult | "unavailable" | null> {
  const token = (await cookies()).get(appCookieName(id))?.value;
  if (!token) return null;
  try {
    const res = await backendFetch(`/applications/${encodeURIComponent(id)}`, { headers: { "X-Access-Token": token } });
    if (res.ok) return (await res.json()) as ApplicationResult;
    return res.status >= 500 ? "unavailable" : null;
  } catch (e) {
    if (e instanceof BackendUnavailable) return "unavailable";
    throw e;
  }
}

export default async function ApplicationPage(props: PageProps<"/application/[id]">) {
  const { id } = await props.params;
  const applicationId = decodeURIComponent(id).toUpperCase();
  const result = await load(applicationId);

  return (
    <div className="bg-stone-50">
      <div className="container-page py-10 md:py-14">
        {result === "unavailable" ? (
          <ServiceUnavailable message="We couldn’t load your decision right now. Please try again in a few minutes." />
        ) : result ? (
          <DecisionView result={result} />
        ) : (
          <div className="mx-auto max-w-3xl">
            <h1 className="text-2xl font-semibold text-navy md:text-3xl">View your decision</h1>
            <p className="mt-2 mb-6 text-stone-600">For your privacy, please confirm the email address you applied with.</p>
            <StatusLookup defaultId={/^LW-\d{4}-\d{6}$/.test(applicationId) ? applicationId : undefined} />
          </div>
        )}
      </div>
    </div>
  );
}
