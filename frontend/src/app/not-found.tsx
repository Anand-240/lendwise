import { Compass } from "lucide-react";
import { ButtonLink } from "@/components/site/button-link";

export default function NotFound() {
  return (
    <section className="container-page flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <span className="flex size-14 items-center justify-center rounded-lg bg-brand-soft text-brand">
        <Compass className="size-7" aria-hidden />
      </span>
      <p className="mt-6 text-sm font-semibold text-brand">404</p>
      <h1 className="mt-2 text-3xl font-semibold text-navy">We couldn’t find that page</h1>
      <p className="mt-3 max-w-md text-stone-600">The link may be broken or the page may have moved.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/" variant="default">Back to home</ButtonLink>
        <ButtonLink href="/status" variant="outline">Check application status</ButtonLink>
      </div>
    </section>
  );
}
