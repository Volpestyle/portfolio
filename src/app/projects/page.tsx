import { ProjectsGrid } from './ProjectsGrid';
import { buildProjectSummary } from '@portfolio/chat-data';
import { getChatDataProviders } from '@/server/chat/dataProviders';
import { getPortfolioRepos } from '@/lib/github-server';
import { augmentRepoWithKnowledge } from '@/server/project-knowledge';
import { normalizeProjectKey } from '@/lib/projects/normalize';
import type { Metadata } from 'next';
import type { ProjectSummary, RepoData } from '@portfolio/chat-contract';

export const metadata: Metadata = {
  title: "Projects - JCV's Portfolio",
  description: 'Explore my software engineering projects and open source contributions',
};

export default async function Projects() {
  const { projectRepository } = getChatDataProviders();

  const [projectRecords, repoResponse] = await Promise.all([projectRepository.listProjects(), getPortfolioRepos()]);
  const summaries = projectRecords.map((project) => buildProjectSummary(project));

  const orderedRepos = [...repoResponse.starred, ...repoResponse.normal];
  const augmentedRepos = await Promise.all(orderedRepos.map((repo) => augmentRepoWithKnowledge(repo)));
  const repoByKey = new Map(augmentedRepos.map((repo) => [normalizeProjectKey(repo.name), repo]));

  const entries: Array<{ project: ProjectSummary; repo?: RepoData }> = summaries.map((summary) => {
    const key = normalizeProjectKey(summary.slug ?? summary.name);
    const repo = repoByKey.get(key);
    return { project: summary, repo };
  });

  const starredEntries: Array<{ project: ProjectSummary; repo?: RepoData }> = [];
  const regularEntries: Array<{ project: ProjectSummary; repo?: RepoData }> = [];
  for (const entry of entries) {
    if (entry.repo?.isStarred) {
      starredEntries.push(entry);
    } else {
      regularEntries.push(entry);
    }
  }

  return <ProjectsGrid projects={[...starredEntries, ...regularEntries]} />;
}

export const revalidate = 3600; // Revalidate every hour
