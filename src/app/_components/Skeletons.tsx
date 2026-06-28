export function SkeletonKpiCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="h-3 w-14 rounded-md bg-slate-200 dark:bg-white/10" />
      <div className="mt-2 h-6 w-24 rounded-md bg-slate-200 dark:bg-white/10" />
      <div className="mt-1.5 h-3 w-20 rounded-md bg-slate-200 dark:bg-white/10" />
    </div>
  );
}

export function SkeletonCashCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="space-y-4">
        <div className="h-4 w-32 rounded-md bg-slate-200 dark:bg-white/10" />
        <div className="h-8 w-48 rounded-md bg-slate-200 dark:bg-white/10" />
        <div className="h-3 w-40 rounded-md bg-slate-200 dark:bg-white/10" />
        <div className="mt-6 flex gap-3">
          <div className="h-10 flex-1 rounded-xl bg-slate-200 dark:bg-white/10" />
          <div className="h-10 flex-1 rounded-xl bg-slate-200 dark:bg-white/10" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonListRows({ count = 3 }: { count?: number }) {
  return (
    <div className="animate-pulse divide-y divide-slate-100 dark:divide-white/5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-white/10" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 rounded-md bg-slate-200 dark:bg-white/10" />
            <div className="h-3 w-48 rounded-md bg-slate-200 dark:bg-white/10" />
          </div>
          <div className="h-7 w-16 rounded-lg bg-slate-200 dark:bg-white/10" />
        </div>
      ))}
    </div>
  );
}
