'use client';

import { MarkdownViewer } from '@/components/MarkdownViewer';

interface DocumentInlinePanelProps {
  repo: string;
  title: string;
  path: string;
  content: string;
  breadcrumbsOverride?: { label: string; href?: string; onClick?: () => void }[];
  onDocLinkClick?: (nextPath: string, label?: string) => void;
}

export function DocumentInlinePanel({
  repo,
  title,
  path,
  content,
  breadcrumbsOverride,
  onDocLinkClick,
}: DocumentInlinePanelProps) {
  if (!content?.trim()) {
    return (
      <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
        <p className="text-sm text-white/60">No content available for this document.</p>
      </div>
    );
  }

  const breadcrumbs = breadcrumbsOverride ?? [{ label: 'Projects' }, { label: repo }, { label: title || path }];

  return (
    <MarkdownViewer
      content={content}
      pid={repo}
      breadcrumbs={breadcrumbs}
      variant="chat"
      onDocLinkClick={onDocLinkClick}
    />
  );
}
