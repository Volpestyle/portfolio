import type { QueryKey } from '@tanstack/react-query';

export const PROJECT_LIST_QUERY_KEY: QueryKey = ['project-list', 'all'];

export const projectDetailQueryKey = (projectId: string): QueryKey => ['project-detail', projectId];

export const projectDocumentQueryKey = (projectId: string, docPath: string): QueryKey => [
  'project-document',
  projectId,
  docPath,
];

export const projectRepoQueryKey = (projectId: string): QueryKey => ['project-repo', projectId];
