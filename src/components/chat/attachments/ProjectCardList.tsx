'use client';

import type { RepoData } from '@/lib/github-server';
import { ProjectCard } from '@/components/ProjectCard';
import { useChat } from '@/hooks/useChat';

export function ProjectCardList({ repos }: { repos: RepoData[] }) {
  const { openProjectInline } = useChat();

  if (!repos.length) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      {repos.map((repo) => (
        <ProjectCard key={repo.name} repo={repo} variant="chat" onOpen={() => openProjectInline(repo.name)} />
      ))}
    </div>
  );
}
