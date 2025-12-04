'use client';

type ToolCallIndicatorProps = {
  title: string;
  description?: string;
  statusLabel?: string;
  tone?: 'success' | 'warning' | 'info';
};

export function ToolCallIndicator({
  title,
  description,
  statusLabel = 'Tool call',
  tone = 'info',
}: ToolCallIndicatorProps) {
  const badgeClass = tone === 'warning' ? 'bg-amber-400/80' : tone === 'success' ? 'bg-emerald-400/70' : 'bg-white/60';

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white/80 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-white/60">
        <span
          aria-hidden="true"
          className={`inline-flex h-2 w-2 items-center justify-center rounded-full ${badgeClass}`}
        />
        {statusLabel}
      </div>
      <p className="mt-1 text-sm font-semibold text-white">{title}</p>
      {description ? <p className="mt-1 text-sm text-white/70">{description}</p> : null}
    </div>
  );
}
