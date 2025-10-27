'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { MarkdownViewer } from '@/components/MarkdownViewer';
import { useRepoDocument } from '@/hooks/useRepoDocument';

interface DocumentInlinePanelProps {
  repo: string;
  title: string;
  path: string;
  content: string;
  breadcrumbsOverride?: { label: string; href?: string; onClick?: () => void }[];
}

export function DocumentInlinePanel({ repo, title, path, content, breadcrumbsOverride }: DocumentInlinePanelProps) {
  const [currentDoc, setCurrentDoc] = useState({ content, title, path });
  const [isLoading, setIsLoading] = useState(false);
  const { ensureDocument, seedDocument } = useRepoDocument();

  const { owner, repoName } = useMemo(() => parseRepoIdentifier(repo), [repo]);

  useEffect(() => {
    if (!owner || !repoName || !path) {
      return;
    }

    seedDocument(owner, repoName, path, {
      owner,
      repo: repoName,
      path,
      content,
      projectName: repoName,
    });
  }, [content, owner, path, repoName, seedDocument]);

  const handleDocLinkClick = useCallback(
    async (docPath: string, label?: string) => {
      if (!owner || !repoName) {
        console.warn('Missing repository information for document fetch:', repo);
        return;
      }

      setIsLoading(true);
      try {
        const document = await ensureDocument(owner, repoName, docPath);
        setCurrentDoc({
          content: document.content,
          title: label || document.path.split('/').pop() || 'Document',
          path: document.path,
        });
      } catch (error) {
        console.error('Error fetching document:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [ensureDocument, owner, repo, repoName]
  );

  const handleBackToOriginal = useCallback(() => {
    setCurrentDoc({ content, title, path });
  }, [content, path, title]);

  const breadcrumbs = breadcrumbsOverride ?? [
    { label: repo },
    {
      label: 'README',
      onClick: handleBackToOriginal,
    },
    { label: currentDoc.title || currentDoc.path.split('/').pop() || 'Doc' },
  ];

  if (!currentDoc.content || !currentDoc.content.trim()) {
    return (
      <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
        <p className="text-sm text-white/60">No content available for this document.</p>
      </div>
    );
  }

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-white/10">
      <MarkdownViewer
        content={currentDoc.content}
        pid={repo}
        breadcrumbs={breadcrumbs}
        variant="chat"
        isLoading={isLoading}
        onDocLinkClick={handleDocLinkClick}
      />
    </div>
  );
}

function parseRepoIdentifier(identifier: string) {
  if (!identifier) {
    return { owner: '', repoName: '' };
  }

  if (!identifier.includes('/')) {
    return { owner: identifier, repoName: identifier };
  }

  const [owner, ...rest] = identifier.split('/');
  const repoName = rest.join('/') || owner;
  return {
    owner: owner || identifier,
    repoName,
  };
}
