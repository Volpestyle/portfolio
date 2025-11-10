'use client';

import { Markdown } from '@/components/Markdown';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
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

  const containerClass = isChat ? 'mx-auto max-w-3xl' : 'container mx-auto max-w-4xl px-4 py-8';
  const wrapperClass = isChat ? 'max-h-[60vh] overflow-y-auto px-4 py-4 bg-black/10 backdrop-blur-sm' : 'min-h-screen';
  const navClass = isChat
    ? 'flex items-center gap-2 text-xs text-white/60 mb-3'
    : 'mb-8 flex items-center space-x-2 text-sm';
  const iconClass = isChat ? 'h-3 w-3 text-white/50' : 'h-4 w-4 text-gray-600';
  const markdownClass = isChat
    ? 'preserve-case'
    : 'preserve-case rounded-lg border border-gray-800 bg-gray-900/50 p-8';

  if (isLoading) {
    return (
      <div className={wrapperClass}>
        <div className={containerClass}>
          <div className="flex min-h-[400px] items-center justify-center">
            <div className="animate-pulse text-gray-400">Loading document...</div>
          </div>
        </div>
      </div>
    );
  }

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
              ) : crumb.onClick ? (
                <button
                  onClick={crumb.onClick}
                  className="cursor-pointer text-gray-400 transition-colors hover:text-white"
                >
                  {crumb.label}
                </button>
              ) : (
                <span className="text-white">{crumb.label}</span>
              )}
            </div>
          ))}
        </nav>

        {children}

        <div className={markdownClass} data-testid="markdown-viewer">
          <Markdown
            content={content || ''}
            variant={isChat ? 'compact' : 'default'}
            imageRenderer="server"
            onImageClick={handleImageClick}
            pid={pid}
            onDocLinkClick={onDocLinkClick}
          />
        </div>
      </div>
    </div>
  );
}
