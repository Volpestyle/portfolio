'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { documentQueryKey } from '@/lib/query-keys';

export type RepoDocumentData = {
  owner: string;
  repo: string;
  path: string;
  content: string;
  projectName?: string;
};

function encodePath(path: string) {
  return path
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

async function fetchRepoDocument(owner: string, repo: string, path: string): Promise<RepoDocumentData> {
  if (!owner || !repo || !path) {
    throw new Error('owner, repo, and path are required to load a document');
  }

  const encodedOwner = encodeURIComponent(owner);
  const encodedRepo = encodeURIComponent(repo);
  const encodedPath = encodePath(path);

  const response = await fetch(`/api/github/document/${encodedOwner}/${encodedRepo}/${encodedPath}`);
  if (!response.ok) {
    throw new Error('Failed to fetch document');
  }

  const data = await response.json();
  return {
    owner: data.owner ?? owner,
    repo: data.repo ?? repo,
    path: data.path ?? path,
    content: data.content,
    projectName: data.projectName,
  };
}

export function useRepoDocument() {
  const queryClient = useQueryClient();

  const getCachedDocument = useCallback(
    (owner: string, repo: string, path: string) => {
      if (!owner || !repo || !path) {
        return undefined;
      }
      return queryClient.getQueryData<RepoDocumentData>(documentQueryKey(owner, repo, path));
    },
    [queryClient]
  );

  const ensureDocument = useCallback(
    async (owner: string, repo: string, path: string) => {
      return queryClient.ensureQueryData({
        queryKey: documentQueryKey(owner, repo, path),
        queryFn: () => fetchRepoDocument(owner, repo, path),
        staleTime: 1000 * 60 * 10,
        gcTime: 1000 * 60 * 30,
      });
    },
    [queryClient]
  );

  const seedDocument = useCallback(
    (owner: string, repo: string, path: string, document: RepoDocumentData) => {
      if (!owner || !repo || !path) {
        return;
      }
      queryClient.setQueryData(documentQueryKey(owner, repo, path), document);
    },
    [queryClient]
  );

  return { getCachedDocument, ensureDocument, seedDocument };
}
