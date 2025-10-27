'use client';

import { TypeWriter } from '@/components/TypeWriter';
import { useChat } from '@/hooks/useChat';
import { useHover } from '@/context/HoverContext';

export function HeroTitle() {
  const { chatStarted } = useChat();
  const { hoverText } = useHover();

  return (
    <div className="mb-2 text-center">
      <div className="min-h-[70px] sm:min-h-[70px]">
        <TypeWriter
          baseText="hi, i'm james."
          hoverText={hoverText}
          speed={70}
          className="text-2xl"
          hideCursorOnComplete={chatStarted}
        />
      </div>
    </div>
  );
}
