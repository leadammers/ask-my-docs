import { Skeleton } from '@/components/ui/skeleton';

/** The workspace's own shape while the notebook, its sources and its history load. */
export default function NotebookLoading() {
  return (
    <main className="mx-auto flex h-dvh w-full max-w-7xl flex-col gap-4 overflow-hidden p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-2">
        <Skeleton className="size-8 rounded-md" />
        <Skeleton className="h-8 w-56" />
      </div>
      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="hidden flex-col gap-3 lg:flex">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
        <div className="flex min-h-0 flex-col gap-3">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="min-h-0 flex-1" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
      <span className="sr-only">Loading notebook…</span>
    </main>
  );
}
