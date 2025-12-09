'use client';

import { ChevronRight, FileText, Folder, type LucideIcon } from 'lucide-react';
import { TransitionLink } from '@/components/PageTransition';

interface DirectoryEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
}

interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: LucideIcon;
  iconClassName?: string;
}

interface DirectoryViewProps {
  pid: string;
  path: string;
  entries: DirectoryEntry[];
  breadcrumbs: BreadcrumbItem[];
}

export function DirectoryView({ pid, path, entries, breadcrumbs }: DirectoryViewProps) {
  const breadcrumbIconClass = 'h-4 w-4 text-blue-300';

  return (
    <div className="min-h-screen">
      <div className="container mx-auto max-w-4xl px-3 pt-4 pb-8 sm:px-4">
        <nav className="mt-2 mb-4 flex items-center space-x-2 text-sm">
          {breadcrumbs.map((crumb, index) => {
            const Icon = crumb.icon;
            const iconClassName = Icon
              ? [breadcrumbIconClass, crumb.iconClassName].filter(Boolean).join(' ')
              : undefined;

            return (
              <div key={index} className="flex items-center gap-1.5">
                {index > 0 && <ChevronRight className="h-4 w-4 text-white/50" />}
                {Icon && <Icon className={iconClassName} />}
                {crumb.href ? (
                  <TransitionLink href={crumb.href} className="text-gray-400 transition-colors hover:text-white">
                    {crumb.label}
                  </TransitionLink>
                ) : (
                  <span className="text-white">{crumb.label}</span>
                )}
              </div>
            );
          })}
        </nav>

        <div className="mb-2 font-mono text-xs text-gray-500">{path}/</div>

        <div className="rounded-lg border border-gray-800 bg-black/80">
          {entries.length === 0 ? (
            <div className="p-4 text-gray-400">Empty directory</div>
          ) : (
            <ul className="divide-y divide-gray-800">
              {entries.map((entry) => (
                <li key={entry.path}>
                  <TransitionLink
                    href={`/projects/${pid}/doc/${entry.path}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/5"
                  >
                    {entry.type === 'dir' ? (
                      <Folder className="h-5 w-5 text-blue-400" />
                    ) : (
                      <FileText className="h-5 w-5 text-gray-400" />
                    )}
                    <span className="text-white">{entry.name}</span>
                  </TransitionLink>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
