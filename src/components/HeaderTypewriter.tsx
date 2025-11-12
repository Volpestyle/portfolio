'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';

export const ROUTE_BASE_TEXT = [
  { match: (pathname: string) => pathname === '/', text: 'JCV' },
  { match: (pathname: string) => pathname.startsWith('/projects'), text: 'my work' },
  { match: (pathname: string) => pathname.startsWith('/about'), text: 'about me' },
  { match: (pathname: string) => pathname.startsWith('/blog'), text: 'my thoughts' },
  { match: (pathname: string) => pathname.startsWith('/contact'), text: 'contact me' },
] as const;

const DEFAULT_BASE_TEXT = 'JCV';
const TYPE_SPEED = 140;
const BACKSPACE_SPEED = 45;

export function resolveHeaderBaseText(pathname: string | null) {
  if (!pathname) return DEFAULT_BASE_TEXT;
  const match = ROUTE_BASE_TEXT.find((entry) => entry.match(pathname));
  return match?.text ?? DEFAULT_BASE_TEXT;
}

type HeaderTypewriterProps = {
  hoverText?: string;
};

export function HeaderTypewriter({ hoverText }: HeaderTypewriterProps) {
  const pathname = usePathname();
  const baseText = useMemo(() => resolveHeaderBaseText(pathname), [pathname]);
  const targetText = !hoverText?.length ? baseText : hoverText;
  const [displayText, setDisplayText] = useState('');
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (displayText === targetText) return;

    const commonLength = getCommonPrefixLength(displayText, targetText);
    const shouldDelete = displayText.length > commonLength;
    const delay = shouldDelete ? BACKSPACE_SPEED : TYPE_SPEED;

    const timer = setTimeout(() => {
      setDisplayText((prev) => {
        if (shouldDelete) {
          return prev.slice(0, -1);
        }

        const nextLength = prev.length + 1;
        return targetText.slice(0, nextLength);
      });
    }, delay);

    return () => clearTimeout(timer);
  }, [displayText, targetText]);

  return (
    <motion.div
      className="font-mono text-lg font-semibold text-white [@media(min-width:440px)]:text-2xl"
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      animate={{
        letterSpacing: isHovered ? '0.2em' : '0.05em',
      }}
      transition={{
        duration: 0.4,
        ease: [0.4, 0, 0.2, 1],
      }}
    >
      {displayText}
      {displayText !== targetText && <span className="animate-blink ml-1">▋</span>}
    </motion.div>
  );
}

function getCommonPrefixLength(a: string, b: string) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) {
    i += 1;
  }
  return i;
}
