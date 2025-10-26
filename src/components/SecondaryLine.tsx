'use client';

import type { BannerState } from '@/types/chat';

interface SecondaryLineProps {
  state: BannerState;
}

export function SecondaryLine({ state }: SecondaryLineProps) {
  const text = resolveText(state);

  return (
    <p className="text-sm text-gray-400" aria-live="polite">
      {text}
    </p>
  );
}

function resolveText(state: BannerState): string {
  switch (state.mode) {
    case 'thinking':
      return 'give me a sec while I pull that up...';
    case 'hover':
      return state.text || 'hover the header icons to explore';
    case 'chat':
      return state.text || 'chatting now...';
    case 'idle':
    default:
      return 'hover the header icons to explore';
  }
}
