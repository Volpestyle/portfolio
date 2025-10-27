'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { readmeQueryKey } from '@/lib/query-keys';

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
      return queryClient.getQueryData<string>(readmeQueryKey(owner, repo));
    },
    [queryClient]
  );

  const ensureReadme = useCallback(
    async (owner: string, repo: string) => {
      if (!owner || !repo) {
        throw new Error('owner and repo are required to load a README');
      }

      return queryClient.ensureQueryData({
        queryKey: readmeQueryKey(owner, repo),
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
      queryClient.setQueryData(readmeQueryKey(owner, repo), readme);
    },
    [queryClient]
  );

  return { getCachedReadme, ensureReadme, seedReadme };
}
