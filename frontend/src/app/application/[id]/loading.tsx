import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="bg-stone-50" aria-busy="true" aria-label="Loading decision">
      <div className="container-page space-y-6 py-10 md:py-14">
        <Skeleton className="h-72 w-full rounded-lg" />
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Skeleton className="h-80 rounded-lg" />
          <Skeleton className="h-80 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
