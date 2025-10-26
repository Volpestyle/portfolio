'use client';

import { useCallback } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { PortfolioReposResponse, RepoData } from '@/lib/github-server';

const projectListKey: QueryKey = ['project-list', 'all'];

async function fetchProjectList(): Promise<RepoData[]> {
  const response = await fetch('/api/github/portfolio-repos');
  if (!response.ok) {
    throw new Error('Failed to fetch project list');
  }
  const data: PortfolioReposResponse = await response.json();
  return [...data.starred, ...data.normal];
}

export function useProjectListCache() {
  const queryClient = useQueryClient();

  const getCachedProjectList = useCallback(() => {
    return queryClient.getQueryData<RepoData[]>(projectListKey);
  }, [queryClient]);

  const ensureProjectList = useCallback(async () => {
    return queryClient.ensureQueryData({
      queryKey: projectListKey,
      queryFn: fetchProjectList,
    });
  }, [queryClient]);

  const seedProjectList = useCallback(
    (repos: RepoData[]) => {
      if (!repos?.length) {
        return;
      }

      const existing = queryClient.getQueryData<RepoData[]>(projectListKey);
      if (existing && existing.length >= repos.length) {
        return;
      }

      queryClient.setQueryData(projectListKey, repos);
    },
    [queryClient]
  );

  return { getCachedProjectList, ensureProjectList, seedProjectList };
}
