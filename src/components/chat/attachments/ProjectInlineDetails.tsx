'use client';

import { useState, useCallback, useEffect } from 'react';
import type { RepoData } from '@/lib/github-server';
import { ProjectContent } from '@/components/ProjectContent';
import { MarkdownViewer } from '@/components/MarkdownViewer';
import { useRepoReadme } from '@/hooks/useRepoReadme';
import { useRepoDocument } from '@/hooks/useRepoDocument';

interface ProjectInlineDetailsProps {
  repo: RepoData;
  readme: string;
  breadcrumbsOverride?: { label: string; href?: string; onClick?: () => void }[];
}

export function ProjectInlineDetails({ repo, readme, breadcrumbsOverride }: ProjectInlineDetailsProps) {
  const [docView, setDocView] = useState<{ content: string; title: string; path: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { seedReadme } = useRepoReadme();
  const { ensureDocument } = useRepoDocument();

  useEffect(() => {
    const owner = repo.owner?.login;
    if (owner) {
      seedReadme(owner, repo.name, readme);
    }
  }, [repo.name, repo.owner?.login, readme, seedReadme]);

  const handleDocLinkClick = useCallback(
    async (path: string, label?: string) => {
      const owner = repo.owner?.login;
      if (!owner) {
        console.warn('Cannot load document without owner information for repo:', repo.name);
        return;
      }

      setIsLoading(true);
      try {
        const document = await ensureDocument(owner, repo.name, path);
        setDocView({
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
    [ensureDocument, repo.name, repo.owner?.login]
  );

  // If showing a document, render it with breadcrumbs
  if (docView) {
    const breadcrumbs = [
      { label: repo.name },
      {
        label: 'README',
        onClick: () => setDocView(null), // Make README clickable to go back
      },
      { label: docView.title },
    ];

    return (
      <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
        <MarkdownViewer
          content={docView.content}
          pid={repo.name}
          breadcrumbs={breadcrumbs}
          variant="chat"
          isLoading={isLoading}
          onDocLinkClick={handleDocLinkClick}
        />
      </div>
    );
  }

  // Otherwise show the README
  if (!readme || !readme.trim()) {
    return (
      <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
        <p className="text-sm text-white/60">No README available for this project.</p>
      </div>
    );
  }

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
      <ProjectContent
        pid={repo.name}
        readme={readme}
        repoInfo={repo}
        variant="chat"
        breadcrumbsOverride={breadcrumbsOverride}
        onDocLinkClick={handleDocLinkClick}
      />
    </div>
  );
}
