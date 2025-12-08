'use client';

import { useQuery } from '@tanstack/react-query';
import { projectDocumentQueryKey } from '@/lib/query-keys';
import { normalizeProjectKey } from '@/lib/projects/normalize';

export type ProjectDocument = {
  repoName: string;
  path: string;
  title: string;
  content: string;
};

export type DirectoryEntry = {
  name: string;
  path: string;
  type: 'file' | 'dir';
};

export type ProjectDirectory = {
  repoName: string;
  path: string;
  entries: DirectoryEntry[];
};

export type DocumentResponse =
  | { type: 'file'; document: ProjectDocument }
  | { type: 'directory'; directory: ProjectDirectory };

async function fetchProjectDocument(projectId: string, docPath: string): Promise<DocumentResponse> {
  const encodedDocPath = docPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/doc/${encodedDocPath}`);
  if (!response.ok) {
    throw new Error('Failed to fetch document');
  }
  const data = await response.json();
  return data as DocumentResponse;
}

type UseProjectDocumentOptions = {
  enabled?: boolean;
};

export function useProjectDocument(
  projectId?: string | null,
  docPath?: string | null,
  options?: UseProjectDocumentOptions
) {
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
