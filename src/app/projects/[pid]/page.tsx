import { ProjectContent } from '@/components/ProjectContent';
import { getRepoDetails, getRepoReadme, getPortfolioRepos } from '@/lib/github-server';
import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ pid: string }> }): Promise<Metadata> {
  const { pid } = await params;
  const repoInfo = await getRepoDetails(pid);

  return {
    title: `${pid} - JCV's Portfolio`,
    description: repoInfo.description || `Details about ${pid} project`,
    openGraph: {
      title: pid,
      description: repoInfo.description || `Details about ${pid} project`,
      type: 'website',
    },
  };
}

export async function generateStaticParams() {
  const repoData = await getPortfolioRepos();
  const repos = [...repoData.starred, ...repoData.normal];

  return repos.map((repo) => ({
    pid: repo.name,
  }));
}

export default async function ProjectDetail({ params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  const [repoInfo, readme] = await Promise.all([getRepoDetails(pid), getRepoReadme(pid)]);

  return (
    <div className="-mx-8 -my-8 bg-black/10 backdrop-blur-sm">
      <ProjectContent pid={pid} repoInfo={repoInfo} readme={readme} />
    </div>
  );
}

export const revalidate = 3600; // Revalidate every hour
