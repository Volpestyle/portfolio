'use client';

import { DirectoryView } from '@/components/DirectoryView';
import type { DirectoryEntry } from '@/lib/github-server';
import { Folder } from 'lucide-react';

interface DirectoryContentProps {
  pid: string;
  path: string[];
  entries: DirectoryEntry[];
}

export function DirectoryContent({ pid, path, entries }: DirectoryContentProps) {
  const directoryBreadcrumbs = path.map((segment, index) => {
    const href = `/projects/${pid}/doc/${path.slice(0, index + 1).join('/')}`;
    const isCurrent = index === path.length - 1;
    return { label: segment, href: isCurrent ? undefined : href, icon: Folder };
  });

  const breadcrumbs = [
    { label: 'Projects', href: '/projects' },
    { label: pid, href: `/projects/${pid}` },
    ...directoryBreadcrumbs,
  ];

  return <DirectoryView pid={pid} path={path.join('/')} entries={entries} breadcrumbs={breadcrumbs} />;
}
