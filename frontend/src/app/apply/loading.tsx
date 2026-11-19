import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="bg-stone-50" aria-busy="true" aria-label="Loading application form">
      <div className="container-page py-10 md:py-14">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-3 h-10 w-80 max-w-full" />
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-[26rem] w-full rounded-lg" />
          <Skeleton className="h-[26rem] w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
