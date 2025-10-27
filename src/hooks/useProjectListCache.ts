'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { PortfolioReposResponse, RepoData } from '@/lib/github-server';
import { PROJECT_LIST_QUERY_KEY } from '@/lib/query-keys';

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
    return queryClient.getQueryData<RepoData[]>(PROJECT_LIST_QUERY_KEY);
  }, [queryClient]);

  const ensureProjectList = useCallback(async () => {
    return queryClient.ensureQueryData({
      queryKey: PROJECT_LIST_QUERY_KEY,
      queryFn: fetchProjectList,
    });
  }, [queryClient]);

  const seedProjectList = useCallback(
    (repos: RepoData[]) => {
      if (!repos?.length) {
        return;
      }

      const existing = queryClient.getQueryData<RepoData[]>(PROJECT_LIST_QUERY_KEY);
      if (existing && existing.length >= repos.length) {
        return;
      }

      queryClient.setQueryData(PROJECT_LIST_QUERY_KEY, repos);
    },
    [queryClient]
  );

  return { getCachedProjectList, ensureProjectList, seedProjectList };
}
