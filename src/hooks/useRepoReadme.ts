'use client';

import { useCallback } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';

const buildCacheKey = (owner: string, repo: string): QueryKey => ['repo-readme', owner, repo];

async function fetchRepoReadme(owner: string, repo: string) {
  const response = await fetch(`/api/github/readme/${owner}/${repo}`);
  if (!response.ok) {
    throw new Error('Failed to fetch README');
  }
  const data: { readme: string } = await response.json();
  return data.readme;
}

export function useRepoReadme() {
  const queryClient = useQueryClient();

  const getCachedReadme = useCallback(
    (owner: string, repo: string) => {
      return queryClient.getQueryData<string>(buildCacheKey(owner, repo));
    },
    [queryClient]
  );

  const ensureReadme = useCallback(
    async (owner: string, repo: string) => {
      if (!owner || !repo) {
        throw new Error('owner and repo are required to load a README');
      }

      return queryClient.ensureQueryData({
        queryKey: buildCacheKey(owner, repo),
        queryFn: () => fetchRepoReadme(owner, repo),
      });
    },
    [queryClient]
  );

  const seedReadme = useCallback(
    (owner: string, repo: string, readme: string) => {
      if (!owner || !repo) {
        return;
      }
      queryClient.setQueryData(buildCacheKey(owner, repo), readme);
    },
    [queryClient]
  );

  return { getCachedReadme, ensureReadme, seedReadme };
}
