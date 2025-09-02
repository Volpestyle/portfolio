'use client';

import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { MarkdownViewer } from '@/components/MarkdownViewer';
import { useDocumentContent } from '@/lib/github';

interface DocumentLoaderProps {
  pid: string;
  path: string[];
}

export function DocumentLoader({ pid, path }: DocumentLoaderProps) {
  const docPath = path.join('/');
  const { data, isLoading, error } = useDocumentContent(pid, docPath);

  const documentName = path[path.length - 1].replace(/\.md$/, '');
  const projectName = data?.projectName || pid;
  
  const breadcrumbs = [
    { label: 'Projects', href: '/projects' },
    { label: projectName, href: `/projects/${pid}` },
    { label: documentName }
  ];

  // If there's an error, render navigation and error message without MarkdownViewer
  if (error) {
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

          {/* Error Message */}
          <div className="flex flex-col items-center justify-center py-20">
            <div className="text-red-500 text-center">
              <p className="text-xl mb-2">Document not found</p>
              <p className="text-sm opacity-75">{error instanceof Error ? error.message : 'Failed to load document'}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <MarkdownViewer
      content={data?.content || ''}
      pid={pid}
      breadcrumbs={breadcrumbs}
      isLoading={isLoading}
    >
      {/* Back to README Button */}
      <Link href={`/projects/${pid}`}>
        <Button variant="ghost" className="mb-6 group">
          <ChevronLeft className="w-4 h-4 mr-2 group-hover:-translate-x-0.5 transition-transform" />
          Back to README
        </Button>
      </Link>
    </MarkdownViewer>
  );
}