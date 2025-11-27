'use client';

import { useQuery } from '@tanstack/react-query';
import type { ProjectDetail } from '@portfolio/chat-contract';
import type { RepoData } from '@/lib/github-server';
import { projectDetailQueryKey } from '@/lib/query-keys';
import { normalizeProjectKey } from '@/lib/projects/normalize';

export type ProjectDetailPayload = {
  project: ProjectDetail;
  repo: RepoData;
  readme: string;
};

async function fetchProjectDetail(projectId: string): Promise<ProjectDetailPayload> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`);
  if (!response.ok) {
    throw new Error('Failed to fetch project details');
  }
  const data = await response.json();
  return data as ProjectDetailPayload;
}

type UseProjectDetailOptions = {
  enabled?: boolean;
};

export function useProjectDetail(projectId?: string | null, options?: UseProjectDetailOptions) {
  const trimmedId = projectId?.trim() ?? '';
  const normalizedId = normalizeProjectKey(trimmedId);
  const shouldFetch = Boolean(trimmedId) && (options?.enabled ?? true);

  return useQuery({
    queryKey: projectDetailQueryKey(normalizedId || 'pending'),
    queryFn: () => fetchProjectDetail(trimmedId),
    enabled: shouldFetch,
    staleTime: 5 * 60 * 1000,
  });
}
