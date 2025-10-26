'use client';

import { createMarkdownComponents } from '@/app/projects/[pid]/markdownComponents';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { ReactNode, useMemo } from 'react';
import { cn } from '@/lib/utils';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

type MarkdownVariant = 'page' | 'chat';

interface MarkdownViewerProps {
  content?: string;
  pid: string;
  breadcrumbs: BreadcrumbItem[];
  children?: ReactNode;
  handleImageClick?: (src: string) => void;
  isLoading?: boolean;
  variant?: MarkdownVariant;
  onDocLinkClick?: (path: string, label?: string) => void;
}

export function MarkdownViewer({
  content,
  pid,
  breadcrumbs,
  children,
  handleImageClick,
  isLoading = false,
  variant = 'page',
  onDocLinkClick,
}: MarkdownViewerProps) {
  const isChat = variant === 'chat';
  const markdownComponents = useMemo(
    () => createMarkdownComponents(pid, { handleImageClick, variant, onDocLinkClick }),
    [pid, handleImageClick, variant, onDocLinkClick]
  );

  const renderedMarkdown = useMemo(() => {
    if (isLoading) {
      return (
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="animate-pulse text-gray-400">Loading document...</div>
        </div>
      );
    }

    return (
      <ReactMarkdown rehypePlugins={[rehypeRaw, rehypeHighlight]} components={markdownComponents}>
        {content || ''}
      </ReactMarkdown>
    );
  }, [content, isLoading, markdownComponents]);

  const containerClass = isChat ? 'mx-auto max-w-3xl space-y-4' : 'container mx-auto max-w-4xl px-4 py-8';
  const wrapperClass = isChat ? 'max-h-[60vh] overflow-y-auto px-4 py-4 text-sm' : 'min-h-screen';
  const navClass = isChat
    ? 'flex items-center gap-2 text-xs text-white/60'
    : 'mb-8 flex items-center space-x-2 text-sm';
  const iconClass = isChat ? 'h-3 w-3 text-white/50' : 'h-4 w-4 text-gray-600';
  const markdownClass = isChat
    ? 'markdown-body preserve-case text-sm leading-relaxed'
    : 'markdown-body preserve-case rounded-lg border border-gray-800 bg-gray-900/50 p-8';

  return (
    <div className={wrapperClass}>
      <div className={cn(containerClass, isChat ? '' : undefined)}>
        <nav className={navClass}>
          {breadcrumbs.map((crumb, index) => (
            <div key={index} className="flex items-center">
              {index > 0 && <ChevronRight className={iconClass} />}
              {crumb.href ? (
                <Link href={crumb.href} className="text-gray-400 transition-colors hover:text-white">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-white">{crumb.label}</span>
              )}
            </div>
          ))}
        </nav>

        {children}

        <div className={markdownClass}>{renderedMarkdown}</div>
      </div>
    </div>
  );
}
