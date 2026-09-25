import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function PageHeader({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: React.ReactNode }) {
  return (
    <section className="border-b border-stone-200 bg-stone-50">
      <div className="container-page py-8 md:py-10">
        <nav aria-label="Breadcrumb">
          <ol className="flex items-center gap-1 text-xs text-stone-500">
            <li>
              <Link href="/" className="hover:text-navy hover:underline">Home</Link>
            </li>
            <li aria-hidden>
              <ChevronRight className="size-3" />
            </li>
            <li aria-current="page" className="text-stone-700">{eyebrow ?? title}</li>
          </ol>
        </nav>
        <h1 className="mt-3 max-w-3xl text-3xl font-semibold text-navy md:text-[2.25rem] md:leading-tight">{title}</h1>
        {description && <div className="mt-3 max-w-2xl text-base leading-relaxed text-stone-600">{description}</div>}
      </div>
    </section>
  );
}
