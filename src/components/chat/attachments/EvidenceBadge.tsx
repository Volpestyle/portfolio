'use client';

import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export function EvidenceBadge({ rank, className }: { rank?: number; className?: string }) {
  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const label = typeof rank === 'number' && Number.isFinite(rank) ? `Evidence #${rank}` : 'Evidence';
  return (
    <span
      className={cn(
        'pointer-events-none inline-flex select-none items-center gap-1 rounded-full border border-emerald-300/50 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-100 shadow-sm backdrop-blur-sm',
        className
      )}
    >
      <Sparkles className="h-3 w-3" />
      {label}
    </span>
  );
}
