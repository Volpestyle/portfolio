import type { RepoData } from '@portfolio/chat-contract';
import { getChatDataProviders } from '@/server/chat/dataProviders';
import { normalizeProjectKey } from '@/lib/projects/normalize';

async function resolveProjectRecord(repoName: string) {
  const normalized = normalizeProjectKey(repoName);
  if (!normalized) {
    return undefined;
  }

  const { projectRepository } = getChatDataProviders();
  const bySlug = await projectRepository.getProjectBySlug(normalized);
  if (bySlug) {
    return bySlug;
  }
  return projectRepository.getProjectByName(normalized);
}

export async function augmentRepoWithKnowledge(repo: RepoData): Promise<RepoData> {
  const record = await resolveProjectRecord(repo.name);
  if (!record) {
    return repo;
  }

  const combinedTags = Array.from(new Set([...(repo.tags ?? []), ...record.tags]));
  const combinedTopics = repo.topics?.length
    ? Array.from(new Set([...(repo.topics ?? []), ...record.tags]))
    : record.tags;

  return {
    ...repo,
    summary: record.oneLiner || repo.summary,
    tags: combinedTags,
    topics: combinedTopics,
    description: repo.description ?? record.description,
  };
}
