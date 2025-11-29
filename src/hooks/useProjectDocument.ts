'use client';

import { useQuery } from '@tanstack/react-query';
import { projectDocumentQueryKey } from '@/lib/query-keys';
import { normalizeProjectKey } from '@/lib/projects/normalize';

type ProjectDocument = {
  repoName: string;
  path: string;
  title: string;
  content: string;
};

async function fetchProjectDocument(projectId: string, docPath: string): Promise<ProjectDocument> {
  const encodedDocPath = docPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/doc/${encodedDocPath}`);
  if (!response.ok) {
    throw new Error('Failed to fetch document');
  }
  const data = await response.json();
  return data.document as ProjectDocument;
}

type UseProjectDocumentOptions = {
  enabled?: boolean;
};

export function useProjectDocument(projectId?: string | null, docPath?: string | null, options?: UseProjectDocumentOptions) {
  const trimmedProjectId = projectId?.trim() ?? '';
  const trimmedDocPath = docPath?.trim() ?? '';
  const normalizedProjectId = normalizeProjectKey(trimmedProjectId);
  const shouldFetch = Boolean(trimmedProjectId && trimmedDocPath) && (options?.enabled ?? true);

  return useQuery({
    queryKey: projectDocumentQueryKey(normalizedProjectId || 'pending-project', trimmedDocPath || 'pending-doc'),
    queryFn: () => fetchProjectDocument(trimmedProjectId, trimmedDocPath),
    enabled: shouldFetch,
    staleTime: 10 * 60 * 1000,
  });
}
