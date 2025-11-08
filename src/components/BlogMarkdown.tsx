'use client';

import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import Image from 'next/image';
import { useMemo } from 'react';
import type { Components } from 'react-markdown';
import { cn } from '@/lib/utils';

interface BlogMarkdownProps {
  content: string;
}

export function BlogMarkdown({ content }: BlogMarkdownProps) {
  const components = useMemo<Components>(
    () => ({
      h1: ({ children, ...props }) => (
        <h1 className="mb-6 mt-8 text-4xl font-bold text-white first:mt-0" {...props}>
          {children}
        </h1>
      ),
      h2: ({ children, ...props }) => (
        <h2 className="mb-4 mt-8 text-3xl font-bold text-white" {...props}>
          {children}
        </h2>
      ),
      h3: ({ children, ...props }) => (
        <h3 className="mb-3 mt-6 text-2xl font-semibold text-white" {...props}>
          {children}
        </h3>
      ),
      h4: ({ children, ...props }) => (
        <h4 className="mb-2 mt-4 text-xl font-semibold text-white" {...props}>
          {children}
        </h4>
      ),
      p: ({ children, ...props }) => (
        <p className="mb-4 leading-relaxed text-gray-300" {...props}>
          {children}
        </p>
      ),
      a: ({ children, href, ...props }) => (
        <a
          href={href}
          className="text-blue-400 underline decoration-blue-400/30 transition-colors hover:text-blue-300 hover:decoration-blue-300/50"
          target={href?.startsWith('http') ? '_blank' : undefined}
          rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
          {...props}
        >
          {children}
        </a>
      ),
      ul: ({ children, ...props }) => (
        <ul className="mb-4 ml-6 list-disc space-y-2 text-gray-300" {...props}>
          {children}
        </ul>
      ),
      ol: ({ children, ...props }) => (
        <ol className="mb-4 ml-6 list-decimal space-y-2 text-gray-300" {...props}>
          {children}
        </ol>
      ),
      li: ({ children, ...props }) => (
        <li className="leading-relaxed" {...props}>
          {children}
        </li>
      ),
      blockquote: ({ children, ...props }) => (
        <blockquote
          className="my-4 border-l-4 border-white/20 bg-white/5 py-3 pl-4 pr-4 italic text-gray-400"
          {...props}
        >
          {children}
        </blockquote>
      ),
      code: ({ inline, className, children, ...props }) => {
        if (inline) {
          return (
            <code
              className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-sm text-blue-300"
              {...props}
            >
              {children}
            </code>
          );
        }
        return (
          <code className={cn('font-mono text-sm', className)} {...props}>
            {children}
          </code>
        );
      },
      pre: ({ children, ...props }) => (
        <pre className="my-4 overflow-x-auto rounded-lg border border-white/20 bg-black/40 p-4" {...props}>
          {children}
        </pre>
      ),
      img: ({ src, alt }) => {
        if (!src) return null;
        // For external images or images with unknown dimensions, use a wrapper
        return (
          <span className="my-6 block">
            <Image
              src={src}
              alt={alt || ''}
              width={800}
              height={600}
              className="w-full rounded-lg border border-white/20"
              style={{ height: 'auto' }}
            />
          </span>
        );
      },
      hr: ({ ...props }) => <hr className="my-8 border-t border-white/20" {...props} />,
      table: ({ children, ...props }) => (
        <div className="my-4 overflow-x-auto">
          <table className="w-full border-collapse border border-white/20" {...props}>
            {children}
          </table>
        </div>
      ),
      th: ({ children, ...props }) => (
        <th className="border border-white/20 bg-white/10 px-4 py-2 text-left font-semibold text-white" {...props}>
          {children}
        </th>
      ),
      td: ({ children, ...props }) => (
        <td className="border border-white/20 px-4 py-2 text-gray-300" {...props}>
          {children}
        </td>
      ),
    }),
    []
  );

  return (
    <div className="prose prose-invert max-w-none">
      <ReactMarkdown rehypePlugins={[rehypeRaw, rehypeHighlight]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

