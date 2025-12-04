export default function Loading() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-9 w-48 animate-pulse rounded bg-muted" />
            <div className="h-4 w-64 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-10 w-32 animate-pulse rounded bg-muted" />
        </div>

        {/* Card Skeleton */}
        <div className="space-y-4 rounded-lg border bg-card p-6">
          <div className="h-6 w-32 animate-pulse rounded bg-muted" />

          {/* Filters Skeleton */}
          <div className="flex gap-4">
            <div className="h-10 max-w-md flex-1 animate-pulse rounded bg-muted" />
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-9 w-20 animate-pulse rounded bg-muted" />
              ))}
            </div>
          </div>

          {/* Table Skeleton */}
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded bg-muted" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
