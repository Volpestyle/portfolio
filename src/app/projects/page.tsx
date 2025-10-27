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

  return <ProjectsGrid repos={repos} />;
}

export const revalidate = 3600; // Revalidate every hour
