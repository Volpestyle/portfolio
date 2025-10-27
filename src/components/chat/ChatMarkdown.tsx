'use client';

import { useRef, useState, useLayoutEffect } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { cn } from '@/lib/utils';

type ChatMarkdownProps = {
  text: string;
  className?: string;
  showCursor?: boolean;
};

export function ChatMarkdown({ text, className, showCursor }: ChatMarkdownProps) {
  const [elementCounts, setElementCounts] = useState<Map<string, number>>(new Map());
  const currentElementIndexRef = useRef(0);

  // Get the known element count for this text
  const totalElements = elementCounts.get(text) ?? -1;
  const isCountingPass = totalElements === -1;

  // Reset the counter at the start of render
  currentElementIndexRef.current = 0;

  const cursor = <span className={cn('ml-1 animate-[blink_1s_infinite]')}>▋</span>;

  const trackBlockElement = () => {
    return currentElementIndexRef.current++;
  };

  const shouldShowCursor = (index: number) => {
    if (!showCursor || isCountingPass) return false;
    return index === totalElements - 1;
  };

  const components: Components = {
    p: ({ children, className: cls, ...props }) => {
      const index = trackBlockElement();
      return (
        <p {...props} className={cn('mb-2 leading-relaxed text-white', cls)}>
          {children}
          {shouldShowCursor(index) && cursor}
        </p>
      );
    },
    ul: ({ children, className: cls, ...props }) => {
      const index = trackBlockElement();
      return (
        <ul {...props} className={cn('mb-2 list-disc space-y-1 pl-5 text-white/90 marker:text-white/50', cls)}>
          {children}
          {shouldShowCursor(index) && cursor}
        </ul>
      );
    },
    ol: ({ children, className: cls, ...props }) => {
      const index = trackBlockElement();
      return (
        <ol {...props} className={cn('mb-2 list-decimal space-y-1 pl-5 text-white/90', cls)}>
          {children}
          {shouldShowCursor(index) && cursor}
        </ol>
      );
    },
    li: ({ children, className: cls, ...props }) => (
      <li {...props} className={cn('leading-relaxed text-white', cls)}>
        {children}
      </li>
    ),
    strong: ({ children, className: cls, ...props }) => (
      <strong {...props} className={cn('font-semibold text-white', cls)}>
        {children}
      </strong>
    ),
    em: ({ children, className: cls, ...props }) => (
      <em {...props} className={cn('text-white/80', cls)}>
        {children}
      </em>
    ),
    code: ({ node, children, className: cls, ...props }) => {
      if (!cls) {
        return (
          <code
            {...props}
            className={cn('rounded bg-white/10 px-1 py-0.5 font-mono text-[0.85rem] text-amber-200', cls)}
          >
            {children}
          </code>
        );
      }

      const index = trackBlockElement();
      return (
        <pre
          className={cn(
            'mb-3 overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-sm text-white'
          )}
        >
          <code {...props} className={cls}>
            {children}
            {shouldShowCursor(index) && cursor}
          </code>
        </pre>
      );
    },
    a: ({ children, href, className: cls, ...props }) => (
      <a
        {...props}
        href={href}
        target="_blank"
        rel="noreferrer"
        className={cn('text-blue-300 underline underline-offset-4 hover:text-blue-200', cls)}
      >
        {children}
      </a>
    ),
    blockquote: ({ children, className: cls, ...props }) => {
      const index = trackBlockElement();
      return (
        <blockquote {...props} className={cn('mb-3 border-l-4 border-white/30 pl-3 italic text-white/80', cls)}>
          {children}
          {shouldShowCursor(index) && cursor}
        </blockquote>
      );
    },
    hr: ({ className: cls, ...props }) => {
      const index = trackBlockElement();
      return (
        <>
          <hr {...props} className={cn('my-4 border-white/20', cls)} />
          {shouldShowCursor(index) && cursor}
        </>
      );
    },
  };

  // After render, store the count if needed
  useLayoutEffect(() => {
    if (isCountingPass && currentElementIndexRef.current > 0) {
      setElementCounts((prev) => {
        const next = new Map(prev);
        next.set(text, currentElementIndexRef.current);
        // Limit cache size to prevent memory leaks
        if (next.size > 50) {
          const { value: firstKey, done } = next.keys().next();
          if (!done && firstKey !== undefined) {
            next.delete(firstKey);
          }
        }
        return next;
      });
    }
  }, [text, isCountingPass]);

  if (!text?.trim()) {
    return null;
  }

  return (
    <div className={cn('chat-markdown text-sm leading-relaxed text-white', className)}>
      <ReactMarkdown components={components}>{text}</ReactMarkdown>
    </div>
  );
}
