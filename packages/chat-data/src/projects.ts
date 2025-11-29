import type { ProjectDetail, ProjectSearchResult, ProjectSummary } from '@portfolio/chat-contract';
import type { ProjectRecord } from './index';

export function buildProjectSummary(project: ProjectRecord): ProjectSummary {
  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    oneLiner: project.oneLiner,
    description: project.description,
    impactSummary: project.impactSummary,
    sizeOrScope: project.sizeOrScope,
    techStack: project.techStack,
    languages: project.languages,
    tags: project.tags,
    context: project.context,
    githubUrl: project.githubUrl,
    liveUrl: project.liveUrl,
  };
}

export function buildProjectDetail(project: ProjectRecord): ProjectDetail {
  const { embeddingId: _embeddingId, ...rest } = project;
  void _embeddingId;
  return rest;
}

export function buildProjectSearchResult(project: ProjectRecord): ProjectSearchResult {
  const { readme: _readme, embeddingId: _embeddingId, ...rest } = project;
  void _readme;
  void _embeddingId;
  return rest;
}
