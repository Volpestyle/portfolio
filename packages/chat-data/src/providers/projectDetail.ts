import { buildProjectDetail } from '../projects';
import type { ProjectDetailProvider, ProjectRepository } from './types';

type ProjectDetailProviderOptions = {
  repository: ProjectRepository;
};

async function resolveProject(repository: ProjectRepository, identifier: string) {
  const normalized = identifier.trim();
  if (!normalized) {
    return undefined;
  }
  const bySlug = await repository.getProjectBySlug(normalized);
  if (bySlug) {
    return bySlug;
  }
  return repository.getProjectByName(normalized);
}

export function createProjectDetailProvider(options: ProjectDetailProviderOptions): ProjectDetailProvider {
  const { repository } = options;
  return {
    async getProjectDetail(projectId) {
      const project = await resolveProject(repository, projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }
      return buildProjectDetail(project);
    },
  };
}
