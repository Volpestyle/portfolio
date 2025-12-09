import { ProjectsGrid } from './ProjectsGrid';
import { buildProjectSummary } from '@portfolio/chat-data';
import { getChatDataProviders } from '@/server/chat/dataProviders';
import { getPortfolioRepos } from '@/lib/github-server';
import { augmentRepoWithKnowledge } from '@/server/project-knowledge';
import { normalizeProjectKey } from '@/lib/projects/normalize';
import { getVisibleProjects } from '@/server/portfolio/store';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Projects - JCV's Portfolio",
  description: 'Explore my software engineering projects and open source contributions',
};

export default async function Projects() {
  const { projectRepository } = getChatDataProviders();

  const [projectRecords, repoResponse, visibleProjects] = await Promise.all([
    projectRepository.listProjects(),
    getPortfolioRepos(),
    getVisibleProjects(),
  ]);

  const visibleOrderMap = new Map<string, number>();
  visibleProjects.forEach((project, index) => visibleOrderMap.set(normalizeProjectKey(project.name), index));
  const visibleKeys = new Set(visibleOrderMap.keys());

  const matchedRecords =
    visibleOrderMap.size > 0
      ? projectRecords.filter((record) => visibleKeys.has(normalizeProjectKey(record.slug ?? record.name)))
      : projectRecords;

  // If visibleProjects is configured but none of the records match (common in fixture mode),
  // fall back to showing all projects so the page never renders empty.
  const useFallback = visibleOrderMap.size > 0 && matchedRecords.length === 0;
  const effectiveOrderMap = useFallback ? new Map<string, number>() : visibleOrderMap;
  const effectiveVisibleKeys = useFallback ? new Set<string>() : visibleKeys;

  const filteredRecords = useFallback ? projectRecords : matchedRecords;
  const summaries = filteredRecords.map((project) => buildProjectSummary(project));

  const orderedRepos = [...repoResponse.starred, ...repoResponse.normal];
  const augmentedRepos = await Promise.all(orderedRepos.map((repo) => augmentRepoWithKnowledge(repo)));
  const repoByKey = new Map(augmentedRepos.map((repo) => [normalizeProjectKey(repo.name), repo]));

  const entries = summaries
    .map((summary) => {
      const key = normalizeProjectKey(summary.slug ?? summary.name);
      return {
        project: summary,
        repo: repoByKey.get(key),
        order: effectiveOrderMap.get(key) ?? Number.MAX_SAFE_INTEGER,
      };
    })
    .filter((entry) =>
      effectiveVisibleKeys.size
        ? effectiveVisibleKeys.has(normalizeProjectKey(entry.project.slug ?? entry.project.name))
        : true
    )
    .sort((a, b) => {
      const starredA = Boolean(a.repo?.isStarred);
      const starredB = Boolean(b.repo?.isStarred);
      if (starredA !== starredB) {
        return Number(starredB) - Number(starredA);
      }
      if (effectiveOrderMap.size) {
        if (a.order !== b.order) {
          return a.order - b.order;
        }
      }
      return a.project.name.localeCompare(b.project.name);
    });

  return <ProjectsGrid projects={entries.map(({ project, repo }) => ({ project, repo }))} />;
}

export const revalidate = 3600; // Revalidate every hour
