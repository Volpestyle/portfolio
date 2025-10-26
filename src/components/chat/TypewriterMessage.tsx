'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type TypewriterMessageProps = {
  text: string;
  speed?: number;
  backspaceSpeed?: number;
  className?: string;
};

export function TypewriterMessage({
  text,
  speed = 16,
  backspaceSpeed = 25,
  className,
}: TypewriterMessageProps) {
  const [display, setDisplay] = useState('');

  useEffect(() => {
    if (display === text) {
      return;
    }

    const common = commonPrefix(display, text).length;
    const isDeleting = display.length > common;

    const timeout = setTimeout(() => {
      setDisplay((current) => {
        if (isDeleting) {
          return current.slice(0, -1);
        }
        return text.slice(0, current.length + 1);
      });
    }, isDeleting ? backspaceSpeed : speed);

    return () => clearTimeout(timeout);
  }, [display, text, speed, backspaceSpeed]);

  return (
    <div className={cn('font-mono text-sm leading-6 text-gray-100', className)}>
      {display}
      <span className="ml-1 inline-block animate-[blink_1s_infinite] text-gray-400">▋</span>
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

