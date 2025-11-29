import { ProjectContent } from '@/components/ProjectContent';
import { getRepoByName, getRepoReadme, getPortfolioRepos } from '@/lib/github-server';
import { augmentRepoWithKnowledge } from '@/server/project-knowledge';
import type { Metadata } from 'next';

type ProjectParams = { pid: string };
type PageContext = { params: Promise<ProjectParams> };

export async function generateMetadata({ params }: PageContext): Promise<Metadata> {
  const { pid } = await params;
  const repoInfo = await getRepoByName(pid);

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

export default async function ProjectDetail({ params }: PageContext) {
  const { pid } = await params;
  const [repoInfo, readme] = await Promise.all([getRepoByName(pid), getRepoReadme(pid)]);

  // Augment repo with knowledge (tags, summary, etc.)
  const enrichedRepoInfo = await augmentRepoWithKnowledge(repoInfo);

  return (
    <div className="-mx-8 -my-8 bg-black/10 backdrop-blur-sm">
      <ProjectContent pid={pid} repoInfo={enrichedRepoInfo} readme={readme} />
    </div>
  );
}

export const revalidate = 3600; // Revalidate every hour
