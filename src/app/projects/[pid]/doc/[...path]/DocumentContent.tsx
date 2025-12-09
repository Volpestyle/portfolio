'use client';

import { MarkdownViewer } from '@/components/MarkdownViewer';
import { FileText, Folder } from 'lucide-react';

interface DocumentContentProps {
  content: string;
  pid: string;
  path: string[];
  projectName: string;
}

export function DocumentContent({ content, pid, path, projectName }: DocumentContentProps) {
  const documentName = path[path.length - 1]?.replace(/\.md$/, '') || 'Document';
  const directorySegments = path.slice(0, -1);

  const directoryBreadcrumbs = directorySegments.map((segment, index) => {
    const href = `/projects/${pid}/doc/${directorySegments.slice(0, index + 1).join('/')}`;
    return { label: segment, href, icon: Folder };
  });

  const breadcrumbs = [
    { label: 'Projects', href: '/projects' },
    { label: projectName, href: `/projects/${pid}` },
    ...directoryBreadcrumbs,
    { label: documentName, icon: FileText, iconClassName: 'text-gray-300' },
  ];

  return <MarkdownViewer content={content} pid={pid} breadcrumbs={breadcrumbs} filename={path.join('/')} />;
}
