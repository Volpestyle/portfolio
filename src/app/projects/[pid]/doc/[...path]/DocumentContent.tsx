'use client';

import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { MarkdownViewer } from '@/components/MarkdownViewer';

interface DocumentContentProps {
  content: string;
  pid: string;
  path: string[];
  projectName: string;
}

export function DocumentContent({ content, pid, path, projectName }: DocumentContentProps) {
  const documentName = path[path.length - 1].replace(/\.md$/, '');
  
  const breadcrumbs = [
    { label: 'Projects', href: '/projects' },
    { label: projectName, href: `/projects/${pid}` },
    { label: documentName }
  ];

  return (
    <MarkdownViewer
      content={content}
      pid={pid}
      breadcrumbs={breadcrumbs}
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