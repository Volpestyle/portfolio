'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ProjectSummary } from '@portfolio/chat-contract';
import { PROJECT_LIST_QUERY_KEY } from '@/lib/query-keys';

async function fetchProjectList(): Promise<ProjectSummary[]> {
  const response = await fetch('/api/projects');
  if (!response.ok) {
    throw new Error('Failed to fetch project list');
  }
  const data = await response.json();
  return Array.isArray(data.projects) ? data.projects : [];
}

export function useProjectListCache() {
  const queryClient = useQueryClient();

  const getCachedProjectList = useCallback(() => {
    return queryClient.getQueryData<ProjectSummary[]>(PROJECT_LIST_QUERY_KEY);
  }, [queryClient]);

  const ensureProjectList = useCallback(async () => {
    return queryClient.ensureQueryData({
      queryKey: PROJECT_LIST_QUERY_KEY,
      queryFn: fetchProjectList,
    });
  }, [queryClient]);

  const seedProjectList = useCallback(
    (projects: ProjectSummary[]) => {
      if (!projects?.length) {
        return;
      }

      const existing = queryClient.getQueryData<ProjectSummary[]>(PROJECT_LIST_QUERY_KEY);
      if (existing && existing.length >= projects.length) {
        return;
      }

      queryClient.setQueryData(PROJECT_LIST_QUERY_KEY, projects);
    },
    [queryClient]
  );

  return { getCachedProjectList, ensureProjectList, seedProjectList };
}
