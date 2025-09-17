import { ProjectsGrid } from './ProjectsGrid';
import { getPortfolioRepos } from '@/lib/github-server';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Projects - JCV's Portfolio",
  description: 'Explore my software engineering projects and open source contributions',
};

export default async function Projects() {
  const repoData = await getPortfolioRepos();
  const repos = [...repoData.starred, ...repoData.normal];

  return (
    <div className="m-4">
      <h1 className="mb-6 text-3xl font-bold">My Work</h1>
      <ProjectsGrid repos={repos} />
    </div>
  );
}

export const revalidate = 3600; // Revalidate every hour
