'use client';

import { useRepoDetails, useRepoReadme } from '@/lib/github';
import { ProjectContent } from './ProjectContent';

export function ProjectLoader({ pid }: { pid: string }) {
  const { data: repoInfo, isLoading: isRepoInfoLoading, error: repoInfoError } = useRepoDetails(pid);
  const { data: readme, isLoading: isReadmeLoading, error: readmeError } = useRepoReadme(pid);

  if (readmeError || repoInfoError) {
    throw readmeError || repoInfoError;
  }
  const isLoading = isRepoInfoLoading || isReadmeLoading || !readme || !repoInfo;
  if (isLoading) return <div className="animate-pulse">Loading...</div>;

  return <ProjectContent pid={pid} readme={readme} repoInfo={repoInfo} />;
}
