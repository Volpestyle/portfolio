type AdminPageSkeletonProps = {
  rows?: number;
  withFilters?: boolean;
  showAction?: boolean;
};

/** Shared dark skeleton for admin routes to avoid white flashes during loading */
export function AdminPageSkeleton({
  rows = 4,
  withFilters = true,
  showAction = true,
}: AdminPageSkeletonProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 animate-pulse rounded bg-white/10" />
          <div className="h-4 w-64 animate-pulse rounded bg-white/5" />
        </div>
        {showAction ? <div className="h-10 w-32 animate-pulse rounded bg-white/10" /> : <div />}
      </div>

      <div className="space-y-4 rounded-lg border border-white/20 bg-black/40 p-6 shadow-lg shadow-black/30 backdrop-blur-sm">
        <div className="h-6 w-32 animate-pulse rounded bg-white/10" />

        {withFilters ? (
          <div className="flex flex-wrap gap-4">
            <div className="h-10 min-w-[200px] flex-1 animate-pulse rounded bg-white/5" />
            <div className="flex gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-9 w-20 animate-pulse rounded bg-white/10" />
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="h-16 rounded-md border border-white/10 bg-white/5" />
          ))}
        </div>
      </div>
    </div>
  );
}
