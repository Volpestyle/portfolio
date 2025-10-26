'use client';

import { MarkdownViewer } from '@/components/MarkdownViewer';
import { useChat } from '@/hooks/useChat';

interface DocumentInlinePanelProps {
  repo: string;
  title: string;
  path: string;
  content: string;
  breadcrumbsOverride?: { label: string; href?: string }[];
}

export function DocumentInlinePanel({
  repo,
  title,
  path,
  content,
  breadcrumbsOverride,
}: DocumentInlinePanelProps) {
  const { openDocInline } = useChat();
  const breadcrumbs =
    breadcrumbsOverride ??
    [
      { label: 'README' },
      { label: title || path.split('/').pop() || 'Doc' },
    ];

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
      <MarkdownViewer
        content={content}
        pid={repo}
        breadcrumbs={breadcrumbs}
        variant="chat"
        onDocLinkClick={(docPath, label) => openDocInline(repo, docPath, label)}
      />
    </div>
  );
}
