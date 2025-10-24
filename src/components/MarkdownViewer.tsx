'use client';

import { createMarkdownComponents } from '@/app/projects/[pid]/markdownComponents';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { ReactNode, useMemo } from 'react';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface MarkdownViewerProps {
  content?: string;
  pid: string;
  breadcrumbs: BreadcrumbItem[];
  children?: ReactNode;
  handleImageClick?: (src: string) => void;
  isLoading?: boolean;
}

export function MarkdownViewer({
  content,
  pid,
  breadcrumbs,
  children,
  handleImageClick,
  isLoading = false,
}: MarkdownViewerProps) {
  const markdownComponents = useMemo(
    () => createMarkdownComponents(pid, handleImageClick),
    [pid, handleImageClick]
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

  return (
    <div className="min-h-screen bg-black">
      <div className="container mx-auto max-w-4xl px-4 py-8">
        {/* Breadcrumb Navigation */}
        <nav className="mb-8 flex items-center space-x-2 text-sm">
          {breadcrumbs.map((crumb, index) => (
            <div key={index} className="flex items-center">
              {index > 0 && <ChevronRight className="mr-2 h-4 w-4 text-gray-600" />}
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

        {/* Optional children (for project metadata, buttons, etc.) */}
        {children}

        {/* Document Content */}
        <div className="markdown-body preserve-case rounded-lg border border-gray-800 bg-gray-900/50 p-8">
          {renderedMarkdown}
        </div>
      </div>
    </div>
  );
}
