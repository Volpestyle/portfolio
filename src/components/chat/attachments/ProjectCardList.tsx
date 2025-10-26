'use client';

import { useState, useCallback, useEffect } from 'react';
import type { RepoData } from '@/lib/github-server';
import { ProjectCard } from '@/components/ProjectCard';
import { ProjectInlineDetails } from './ProjectInlineDetails';
import { useRepoReadme } from '@/hooks/useRepoReadme';
import { useProjectListCache } from '@/hooks/useProjectListCache';

export function ProjectCardList({ repos }: { repos: RepoData[] }) {
  const [expandedRepo, setExpandedRepo] = useState<{ repo: RepoData; readme: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { getCachedReadme, ensureReadme } = useRepoReadme();
  const { seedProjectList } = useProjectListCache();

  useEffect(() => {
    seedProjectList(repos);
  }, [repos, seedProjectList]);

  const handleOpenRepo = useCallback(
    async (repo: RepoData) => {
      const owner = repo.owner?.login;
      if (!owner) {
        console.warn('Missing owner information for repo:', repo.name);
        return;
      }

      const cachedReadme = getCachedReadme(owner, repo.name);
      if (cachedReadme) {
        setExpandedRepo({ repo, readme: cachedReadme });
        return;
      }

      setIsLoading(true);
      try {
        const readme = await ensureReadme(owner, repo.name);
        setExpandedRepo({ repo, readme });
      } catch (error) {
        console.error('Error fetching README:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [ensureReadme, getCachedReadme]
  );

  if (!repos.length) {
    return (
      <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
        <p className="text-sm text-white/60">No projects found matching those criteria.</p>
      </div>
    );
  }

  // If a repo is expanded, show the inline details
  if (expandedRepo) {
    return (
      <ProjectInlineDetails
        repo={expandedRepo.repo}
        readme={expandedRepo.readme}
        breadcrumbsOverride={[
          { label: 'Projects', onClick: () => setExpandedRepo(null) },
          { label: expandedRepo.repo.name },
        ]}
      />
    );
  }

  // Otherwise show the card list
  return (
    <div className="mt-3 space-y-3">
      {isLoading ? (
        <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-black/10 py-8 backdrop-blur-sm">
          <div className="animate-pulse text-sm text-white/60">Loading project...</div>
        </div>
      ) : (
        repos.map((repo) => (
          <ProjectCard key={repo.name} repo={repo} variant="chat" onOpen={() => handleOpenRepo(repo)} />
        ))
      )}
    </div>
  );
}
