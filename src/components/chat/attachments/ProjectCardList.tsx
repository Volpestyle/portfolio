'use client';

import { useState, useCallback, useEffect } from 'react';
import type { RepoData } from '@/lib/github-server';
import { ProjectCard } from '@/components/ProjectCard';
import { ProjectInlineDetails } from './ProjectInlineDetails';
import { useRepoReadme } from '@/hooks/useRepoReadme';
import { useProjectListCache } from '@/hooks/useProjectListCache';

interface ExpandedRepoData {
  readme: string;
  isLoading: boolean;
}

export function ProjectCardList({ repos }: { repos: RepoData[] }) {
  // Track expanded state per repo by repo name
  const [expandedRepos, setExpandedRepos] = useState<Map<string, ExpandedRepoData>>(new Map());
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

      // Check if already expanded
      if (expandedRepos.has(repo.name)) {
        // Collapse it
        setExpandedRepos((prev) => {
          const next = new Map(prev);
          next.delete(repo.name);
          return next;
        });
        return;
      }

      // Check cache first
      const cachedReadme = getCachedReadme(owner, repo.name);
      if (cachedReadme) {
        setExpandedRepos((prev) => new Map(prev).set(repo.name, { readme: cachedReadme, isLoading: false }));
        return;
      }

      // Set loading state
      setExpandedRepos((prev) => new Map(prev).set(repo.name, { readme: '', isLoading: true }));

      try {
        const readme = await ensureReadme(owner, repo.name);
        setExpandedRepos((prev) => new Map(prev).set(repo.name, { readme, isLoading: false }));
      } catch (error) {
        console.error('Error fetching README:', error);
        // Remove from expanded on error
        setExpandedRepos((prev) => {
          const next = new Map(prev);
          next.delete(repo.name);
          return next;
        });
      }
    },
    [ensureReadme, getCachedReadme, expandedRepos]
  );

  const handleCollapseRepo = useCallback((repoName: string) => {
    setExpandedRepos((prev) => {
      const next = new Map(prev);
      next.delete(repoName);
      return next;
    });
  }, []);

  if (!repos.length) {
    return (
      <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
        <p className="text-sm text-white/60">No projects found matching those criteria.</p>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {repos.map((repo) => {
        const expandedData = expandedRepos.get(repo.name);
        const isExpanded = expandedData !== undefined;

        return (
          <div key={repo.name}>
            {/* Show the card */}
            {!isExpanded && (
              <ProjectCard key={repo.name} repo={repo} variant="chat" onOpen={() => handleOpenRepo(repo)} />
            )}

            {/* Show the expanded details if this repo is expanded */}
            {isExpanded && (
              <>
                {expandedData.isLoading ? (
                  <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-black/10 py-8 backdrop-blur-sm">
                    <div className="animate-pulse text-sm text-white/60">Loading project...</div>
                  </div>
                ) : (
                  <ProjectInlineDetails
                    repo={repo}
                    readme={expandedData.readme}
                    breadcrumbsOverride={[
                      { label: 'Projects', onClick: () => handleCollapseRepo(repo.name) },
                      { label: repo.name },
                    ]}
                  />
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
