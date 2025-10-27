'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { ChatMarkdown } from './ChatMarkdown';

type TypewriterMessageProps = {
  text: string;
  speed?: number;
  backspaceSpeed?: number;
  className?: string;
  showCursor?: boolean;
  markdown?: boolean;
};

export function TypewriterMessage({
  text,
  speed = 16,
  backspaceSpeed = 25,
  className,
  showCursor = false,
  markdown = false,
}: TypewriterMessageProps) {
  const [display, setDisplay] = useState('');

  useEffect(() => {
    if (display === text) {
      return;
    }

    const common = commonPrefix(display, text).length;
    const isDeleting = display.length > common;

    const timeout = setTimeout(
      () => {
        setDisplay((current) => {
          if (isDeleting) {
            return current.slice(0, -1);
          }
          return text.slice(0, current.length + 1);
        });
      },
      isDeleting ? backspaceSpeed : speed
    );

    return () => clearTimeout(timeout);
  }, [display, text, speed, backspaceSpeed]);

  const baseClass = markdown ? 'text-sm leading-relaxed text-white' : 'font-mono text-sm leading-6 text-gray-100';

  return (
    <div className={cn(baseClass, className)}>
      {markdown ? <ChatMarkdown text={display} showCursor={showCursor} /> : display}
    </div>
  );
}

function commonPrefix(a: string, b: string) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) {
    i += 1;
  }
  return a.slice(0, i);
}
