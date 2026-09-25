export function LegalBody({ updated, children }: { updated: string; children: React.ReactNode }) {
  return (
    <article className="container-page max-w-3xl py-16 text-stone-700 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-navy [&_li]:mt-2 [&_p]:mt-4 [&_p]:leading-relaxed [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6">
      <p className="text-sm text-stone-500">Last updated: {updated}</p>
      {children}
    </article>
  );
}
