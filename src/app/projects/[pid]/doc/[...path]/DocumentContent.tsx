'use client';

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
    />
  );
}
