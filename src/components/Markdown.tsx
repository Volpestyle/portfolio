'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import type { ReactNode } from 'react';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useRef, useState, useLayoutEffect, useCallback, isValidElement } from 'react';
import { cn } from '@/lib/utils';
import { ServerImageRenderer } from '@/components/ServerImageRenderer';
import { markdownSanitizeSchema } from '@/lib/markdown/sanitize';

type MarkdownVariant = 'default' | 'compact';

type ImageRenderer = 'nextjs' | 'server';

interface MarkdownProps {
  content: string;
  variant?: MarkdownVariant;
  className?: string;
  
  // Streaming cursor support
  showCursor?: boolean;
  
  // Image handling
  imageRenderer?: ImageRenderer;
  onImageClick?: (src: string) => void;
  
  // Link handling (for project docs)
  pid?: string;
  onDocLinkClick?: (path: string, label?: string) => void;
}

export function Markdown({
  content,
  variant = 'default',
  className,
  showCursor = false,
  imageRenderer = 'nextjs',
  onImageClick,
  pid,
  onDocLinkClick,
}: MarkdownProps) {
  const isCompact = variant === 'compact';
  
  // Cursor tracking state (for streaming)
  const [elementCounts, setElementCounts] = useState<Map<string, number>>(new Map());
  const currentElementIndexRef = useRef(0);
  
  const totalElements = elementCounts.get(content) ?? -1;
  const isCountingPass = totalElements === -1;
  
  // Reset counter at start of render
  currentElementIndexRef.current = 0;
  
  const cursorElement = useMemo(() => <span className="ml-1 animate-blink">▋</span>, []);
  
  const trackBlockElement = () => {
    return currentElementIndexRef.current++;
  };
  
  const shouldShowCursor = useCallback(
    (index: number) => {
      if (!showCursor || isCountingPass) return false;
      return index === totalElements - 1;
    },
    [showCursor, isCountingPass, totalElements]
  );
  
  const components = useMemo<Components>(() => {
    const baseComponents: Components = {
      h1: ({ children, ...props }) => {
        const index = trackBlockElement();
        return (
          <h1
            className={cn(
              'font-bold text-white',
              isCompact ? 'mb-3 mt-4 text-2xl first:mt-0' : 'mb-6 mt-8 text-4xl first:mt-0'
            )}
            {...props}
          >
            {children}
            {shouldShowCursor(index) && cursorElement}
          </h1>
        );
      },
      h2: ({ children, ...props }) => {
        const index = trackBlockElement();
        return (
          <h2
            className={cn(
              'font-bold text-white',
              isCompact ? 'mb-2 mt-4 text-xl' : 'mb-4 mt-8 text-3xl'
            )}
            {...props}
          >
            {children}
            {shouldShowCursor(index) && cursorElement}
          </h2>
        );
      },
      h3: ({ children, ...props }) => {
        const index = trackBlockElement();
        return (
          <h3
            className={cn(
              'font-semibold text-white',
              isCompact ? 'mb-2 mt-3 text-lg' : 'mb-3 mt-6 text-2xl'
            )}
            {...props}
          >
            {children}
            {shouldShowCursor(index) && cursorElement}
          </h3>
        );
      },
      h4: ({ children, ...props }) => {
        const index = trackBlockElement();
        return (
          <h4
            className={cn(
              'font-semibold text-white',
              isCompact ? 'mb-1 mt-2 text-base' : 'mb-2 mt-4 text-xl'
            )}
            {...props}
          >
            {children}
            {shouldShowCursor(index) && cursorElement}
          </h4>
        );
      },
      h5: ({ children, ...props }) => {
        const index = trackBlockElement();
        return (
          <h5
            className={cn(
              'font-semibold text-white',
              isCompact ? 'mb-1 mt-2 text-sm' : 'mb-2 mt-3 text-lg'
            )}
            {...props}
          >
            {children}
            {shouldShowCursor(index) && cursorElement}
          </h5>
        );
      },
      h6: ({ children, ...props }) => {
        const index = trackBlockElement();
        return (
          <h6
            className={cn(
              'font-semibold text-white',
              isCompact ? 'mb-1 mt-2 text-xs' : 'mb-2 mt-3 text-base'
            )}
            {...props}
          >
            {children}
            {shouldShowCursor(index) && cursorElement}
          </h6>
        );
      },
      p: ({ children, node, ...props }) => {
        const index = trackBlockElement();
        const childNodes = getChildNodes(node);
        const containsOnlyImageAndText =
          childNodes.length > 0 && childNodes.every(isImageOrWhitespaceTextNode);

        if (containsOnlyImageAndText) {
          return (
            <div className="my-4 flex flex-col items-start gap-2">
              {children}
              {shouldShowCursor(index) && cursorElement}
            </div>
          );
        }

        const hasImage = childNodes.some(isImageLikeNode);
        if (hasImage) {
          return (
            <div className="my-4">
              {children}
              {shouldShowCursor(index) && cursorElement}
            </div>
          );
        }

        return (
          <p
            className={cn('leading-relaxed text-gray-300', isCompact ? 'mb-2' : 'mb-4')}
            {...props}
          >
            {children}
            {shouldShowCursor(index) && cursorElement}
          </p>
        );
      },
      a: ({ children, href, ...props }) => {
        // Handle doc links for projects
        if (href && pid && isDocsLink(href)) {
          const cleanPath = normalizeDocPath(href);
          
          if (onDocLinkClick) {
            return (
              <a
                href={href}
                onClick={(event) => {
                  event.preventDefault();
                  onDocLinkClick(cleanPath, extractText(children));
                }}
                className="text-blue-400 underline decoration-blue-400/30 transition-colors hover:text-blue-300 hover:decoration-blue-300/50"
              >
                {children}
              </a>
            );
          }
          
          return (
            <Link
              href={`/projects/${pid}/doc/${cleanPath}`}
              className="text-blue-400 underline decoration-blue-400/30 transition-colors hover:text-blue-300 hover:decoration-blue-300/50"
            >
              {children}
            </Link>
          );
        }
        
        // External links
        return (
          <a
            href={href}
            className="text-blue-400 underline decoration-blue-400/30 transition-colors hover:text-blue-300 hover:decoration-blue-300/50"
            target={href?.startsWith('http') ? '_blank' : undefined}
            rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
            {...props}
          >
            {children}
          </a>
        );
      },
      ul: ({ children, ...props }) => {
        const index = trackBlockElement();
        return (
          <ul
            className={cn(
              'list-disc text-gray-300',
              isCompact ? 'mb-2 ml-5 space-y-1' : 'mb-4 ml-6 space-y-2'
            )}
            {...props}
          >
            {children}
            {shouldShowCursor(index) && cursorElement}
          </ul>
        );
      },
      ol: ({ children, ...props }) => {
        const index = trackBlockElement();
        return (
          <ol
            className={cn(
              'list-decimal text-gray-300',
              isCompact ? 'mb-2 ml-5 space-y-1' : 'mb-4 ml-6 space-y-2'
            )}
            {...props}
          >
            {children}
            {shouldShowCursor(index) && cursorElement}
          </ol>
        );
      },
      li: ({ children, ...props }) => (
        <li className="leading-relaxed" {...props}>
          {children}
        </li>
      ),
      blockquote: ({ children, ...props }) => {
        const index = trackBlockElement();
        return (
          <blockquote
            className={cn(
              'border-l-4 border-white/20 bg-white/5 italic text-gray-400',
              isCompact ? 'my-2 py-2 pl-3 pr-3' : 'my-4 py-3 pl-4 pr-4'
            )}
            {...props}
          >
            {children}
            {shouldShowCursor(index) && cursorElement}
          </blockquote>
        );
      },
      code: ((rawProps) => {
        const { inline, className, children, ...props } = rawProps as {
          inline?: boolean;
          className?: string;
          children: React.ReactNode;
        };
        if (inline) {
          return (
            <code
              className={cn(
                'rounded bg-white/10 font-mono',
                isCompact ? 'px-1 py-0.5 text-[0.85rem] text-amber-200' : 'px-1.5 py-0.5 text-sm text-blue-300'
              )}
              {...props}
            >
              {children}
            </code>
          );
        }
        
        const index = trackBlockElement();
        return (
          <code className={cn('font-mono text-sm', className)} {...props}>
            {children}
            {shouldShowCursor(index) && cursorElement}
          </code>
        );
      }) as Components['code'],
      pre: ({ children, ...props }) => (
        <pre
          className={cn(
            'overflow-x-auto rounded-lg border border-white/20 bg-black/40',
            isCompact ? 'my-3 p-3' : 'my-4 p-4'
          )}
          {...props}
        >
          {children}
        </pre>
      ),
      img: ({ src, alt, ...props }) => {
        if (!src) return null;
        
        if (imageRenderer === 'server') {
          return (
            <span className="inline-block">
              <ServerImageRenderer
                src={src}
                alt={alt || ''}
                onImageClick={onImageClick}
                {...props}
              />
            </span>
          );
        }
        
        // Next.js Image
        return (
          <span className={cn('block', isCompact ? 'my-4' : 'my-6')}>
            <Image
              src={src}
              alt={alt || ''}
              width={800}
              height={600}
              className="w-full rounded-lg border border-white/20"
              style={{ height: 'auto' }}
              onClick={() => onImageClick?.(src)}
            />
          </span>
        );
      },
      hr: ({ ...props }) => {
        const index = trackBlockElement();
        return (
          <>
            <hr className={cn('border-t border-white/20', isCompact ? 'my-4' : 'my-8')} {...props} />
            {shouldShowCursor(index) && cursorElement}
          </>
        );
      },
      table: ({ children, ...props }) => (
        <div className={cn('overflow-x-auto', isCompact ? 'my-2' : 'my-4')}>
          <table className="w-full border-collapse border border-white/20" {...props}>
            {children}
          </table>
        </div>
      ),
      th: ({ children, ...props }) => (
        <th
          className="border border-white/20 bg-white/10 px-4 py-2 text-left font-semibold text-white"
          {...props}
        >
          {children}
        </th>
      ),
      td: ({ children, ...props }) => (
        <td className="border border-white/20 px-4 py-2 text-gray-300" {...props}>
          {children}
        </td>
      ),
      strong: ({ children, ...props }) => (
        <strong className="font-semibold text-white" {...props}>
          {children}
        </strong>
      ),
      em: ({ children, ...props }) => (
        <em className="text-white/80" {...props}>
          {children}
        </em>
      ),
    };
    
    return baseComponents;
  }, [isCompact, pid, onDocLinkClick, onImageClick, imageRenderer, cursorElement, shouldShowCursor]);
  
  // Store element count after counting pass
  useLayoutEffect(() => {
    if (isCountingPass && currentElementIndexRef.current > 0) {
      setElementCounts((prev) => {
        const next = new Map(prev);
        next.set(content, currentElementIndexRef.current);
        // Limit cache size
        if (next.size > 50) {
          const { value: firstKey, done } = next.keys().next();
          if (!done && firstKey !== undefined) {
            next.delete(firstKey);
          }
        }
        return next;
      });
    }
  }, [content, isCountingPass]);
  
  if (!content?.trim()) {
    return null;
  }
  
  return (
    <div className={cn('max-w-none text-base text-gray-200 leading-relaxed [&>*:first-child]:mt-0', className)}>
      <ReactMarkdown
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, markdownSanitizeSchema],
          rehypeHighlight,
        ]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// Helper functions
function isDocsLink(href: string) {
  return href.startsWith('docs/') || href.startsWith('./docs/') || href.startsWith('/docs/');
}

function normalizeDocPath(href: string) {
  return href.replace(/^\.\//, '').replace(/^\/+/, '');
}

function extractText(children: ReactNode): string | undefined {
  if (children === null || children === undefined || typeof children === 'boolean') {
    return undefined;
  }

  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }

  if (Array.isArray(children)) {
    const text = children
      .map((child) => extractText(child))
      .filter(Boolean)
      .join(' ')
      .trim();
    return text || undefined;
  }

  if (isValidElement(children)) {
    return extractText(children.props.children);
  }

  return undefined;
}

type NodeWithChildren = { children?: unknown };

function getChildNodes(node: unknown): unknown[] {
  if (!hasChildren(node)) {
    return [];
  }
  const { children } = node;
  return Array.isArray(children) ? children : [];
}

function hasChildren(node: unknown): node is NodeWithChildren {
  return isObjectLike(node) && 'children' in node;
}

function isImageLikeNode(node: unknown): boolean {
  if (!isObjectLike(node)) {
    return false;
  }
  const { tagName, type } = node as { tagName?: unknown; type?: unknown };
  return tagName === 'img' || type === 'image' || (type === 'element' && tagName === 'img');
}

function isWhitespaceTextNode(node: unknown): boolean {
  if (!isObjectLike(node)) {
    return false;
  }
  const { type, value } = node as { type?: unknown; value?: unknown };
  return type === 'text' && typeof value === 'string' && /^[\s.]*$/.test(value);
}

function isImageOrWhitespaceTextNode(node: unknown): boolean {
  return isImageLikeNode(node) || isWhitespaceTextNode(node);
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
