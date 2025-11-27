'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Markdown } from '@/components/Markdown';

type TypewriterMessageProps = {
  text: string;
  speed?: number;
  backspaceSpeed?: number;
  streamingSpeed?: number;
  streaming?: boolean;
  live?: boolean;
  className?: string;
  showCursor?: boolean;
  markdown?: boolean;
};

export function TypewriterMessage({
  text,
  speed = 16,
  backspaceSpeed = 25,
  streamingSpeed = 4,
  streaming,
  live,
  className,
  showCursor = false,
  markdown = false,
}: TypewriterMessageProps) {
  const [display, setDisplay] = useState('');
  const isStreaming = streaming ?? live ?? false;

  useEffect(() => {
    if (isStreaming) {
      return;
    }

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
  }, [display, text, speed, backspaceSpeed, isStreaming]);

  useEffect(() => {
    if (!isStreaming) {
      return;
    }

    if (display === text) {
      return;
    }

    const delay = Math.max(1, streamingSpeed);

    const timeout = setTimeout(() => {
      setDisplay((current) => {
        if (!isStreaming) {
          return current;
        }

        if (!text.startsWith(current)) {
          return text;
        }

        const remaining = text.length - current.length;
        const advanceBy = Math.max(1, Math.ceil(remaining / 8));
        return text.slice(0, current.length + advanceBy);
      });
    }, delay);

    return () => clearTimeout(timeout);
  }, [display, isStreaming, streamingSpeed, text]);

  const baseClass = markdown ? 'text-sm leading-relaxed text-white' : 'font-mono text-sm leading-6 text-gray-100';

  return (
    <div className={cn(baseClass, className)}>
      {markdown ? <Markdown content={display} variant="compact" showCursor={showCursor} /> : display}
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
