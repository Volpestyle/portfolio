'use client';

import { FileText, Folder, ChevronRight } from 'lucide-react';

interface DirectoryEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
}

interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

interface DirectoryInlinePanelProps {
  path: string;
  entries: DirectoryEntry[];
  breadcrumbsOverride?: BreadcrumbItem[];
  onDocLinkClick?: (nextPath: string, label?: string) => void;
}

export function DirectoryInlinePanel({
  path,
  entries,
  breadcrumbsOverride,
  onDocLinkClick,
}: DirectoryInlinePanelProps) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="max-h-[60vh] overflow-y-auto bg-black/10 px-4 py-4 backdrop-blur-sm">
        {breadcrumbsOverride && (
          <nav className="mb-3 flex items-center gap-2 text-xs text-white/60">
            {breadcrumbsOverride.map((crumb, index) => (
              <div key={index} className="flex items-center gap-1">
                {index > 0 && <ChevronRight className="h-3 w-3 text-white/50" />}
                {crumb.onClick ? (
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
        )}

        <div className="mb-2 font-mono text-xs text-gray-500">{path}/</div>

        <div className="rounded-lg border border-gray-800 bg-black/80">
          {entries.length === 0 ? (
            <div className="p-4 text-gray-400">Empty directory</div>
          ) : (
            <ul className="divide-y divide-gray-800">
              {entries.map((entry) => (
                <li key={entry.path}>
                  <button
                    onClick={() => onDocLinkClick?.(entry.path, entry.name)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5"
                  >
                    {entry.type === 'dir' ? (
                      <Folder className="h-4 w-4 text-blue-400" />
                    ) : (
                      <FileText className="h-4 w-4 text-gray-400" />
                    )}
                    <span className="text-sm text-white">{entry.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
