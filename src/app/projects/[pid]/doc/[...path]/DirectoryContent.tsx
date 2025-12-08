'use client';

import { DirectoryView } from '@/components/DirectoryView';
import type { DirectoryEntry } from '@/lib/github-server';

interface DirectoryContentProps {
  pid: string;
  path: string[];
  entries: DirectoryEntry[];
}

export function DirectoryContent({ pid, path, entries }: DirectoryContentProps) {
  const dirName = path[path.length - 1];

  const breadcrumbs = [
    { label: 'Projects', href: '/projects' },
    { label: pid, href: `/projects/${pid}` },
    { label: dirName },
  ];

  return <DirectoryView pid={pid} path={path.join('/')} entries={entries} breadcrumbs={breadcrumbs} />;
}
