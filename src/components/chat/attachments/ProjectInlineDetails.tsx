'use client';

import type { RepoData } from '@/lib/github-server';
import { ProjectContent } from '@/components/ProjectContent';
import { useChat } from '@/hooks/useChat';

interface ProjectInlineDetailsProps {
  repo: RepoData;
  readme: string;
  breadcrumbsOverride?: { label: string; href?: string }[];
}

export function ProjectInlineDetails({ repo, readme, breadcrumbsOverride }: ProjectInlineDetailsProps) {
  const { openDocInline } = useChat();

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
      <ProjectContent
        pid={repo.name}
        readme={readme}
        repoInfo={repo}
        variant="chat"
        breadcrumbsOverride={breadcrumbsOverride}
        onDocLinkClick={(path, label) => openDocInline(repo.name, path, label)}
      />
    </div>
  );
}
