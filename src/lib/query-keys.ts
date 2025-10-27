import type { QueryKey } from '@tanstack/react-query';

export const PROJECT_LIST_QUERY_KEY: QueryKey = ['project-list', 'all'];

export const readmeQueryKey = (owner: string, repo: string): QueryKey => ['repo-readme', owner, repo];

export const documentQueryKey = (owner: string, repo: string, path: string): QueryKey => [
  'repo-document',
  owner,
  repo,
  path,
];
