'use client';

import { usePortfolioRepos } from '@/lib/github';
import { ProjectCard } from './ProjectCard';

export default function Projects() {
  const { data: repoData, isLoading, error } = usePortfolioRepos();

  if (isLoading) {
    return (
      <>
        <h1 className="mb-6 text-3xl font-bold">My Code</h1>
        <div className="animate-pulse">Loading projects...</div>
      </>
    );
  }

  if (error || !repoData) {
    return (
      <>
        <h1 className="mb-6 text-3xl font-bold">My Code</h1>
        <p className="text-gray-400">Unable to load projects at the moment. Please try again later.</p>
      </>
    );
  }

  const repos = [...repoData.starred, ...repoData.normal];

  return (
    <>
      <h1 className="mb-6 text-3xl font-bold">My Code</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {repos.map((repo) => (
          <ProjectCard key={repo.id} repo={repo} />
        ))}
      </div>
    </>
  );
}

export const dynamic = 'force-dynamic';
