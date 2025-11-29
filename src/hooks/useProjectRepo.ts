'use client';

import { useQuery } from '@tanstack/react-query';
import type { RepoData } from '@portfolio/chat-contract';
import { projectRepoQueryKey } from '@/lib/query-keys';
import { normalizeProjectKey } from '@/lib/projects/normalize';

async function fetchProjectRepo(projectId: string): Promise<RepoData> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/repo`);
  if (!response.ok) {
    throw new Error('Failed to fetch project repo');
  }
  const data = await response.json();
  return data.repo as RepoData;
}

type UseProjectRepoOptions = {
  enabled?: boolean;
};

export function useProjectRepo(projectId?: string | null, options?: UseProjectRepoOptions) {
  const trimmedId = projectId?.trim() ?? '';
  const normalizedId = normalizeProjectKey(trimmedId);
  const shouldFetch = Boolean(trimmedId) && (options?.enabled ?? true);

  return useQuery({
    queryKey: projectRepoQueryKey(normalizedId || 'pending'),
    queryFn: () => fetchProjectRepo(trimmedId),
    enabled: shouldFetch,
    staleTime: 5 * 60 * 1000,
  });
}
