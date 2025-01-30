'use client';

import { RepoData, usePortfolioRepos } from '@/lib/github';
import { ProjectCard } from './ProjectCard';

function ProjectsGrid({ repos }: { repos: RepoData[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {repos.map((repo, index) => (
        <ProjectCard key={index} repo={repo} />
      ))}
    </div>
  );
}

export function ProjectsLoader() {
  const { data: repoData, isLoading, error } = usePortfolioRepos();

  if (error) {
    throw error;
  }

  if (isLoading || !repoData) {
    return <div className="animate-pulse">Loading projects...</div>;
  }

  const repos = [...repoData.starred, ...repoData.normal];

  return (
    <>
      <h1 className="mb-6 text-3xl font-bold">My Code</h1>
      <ProjectsGrid repos={repos} />
    </>
  );
}
