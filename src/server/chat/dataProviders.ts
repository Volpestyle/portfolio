import type {
  ExperienceRepository,
  ProfileRepository,
  ProjectDetailProvider,
  ProjectRepository,
} from '@portfolio/chat-data';
import { createFilesystemChatProviders } from '@portfolio/chat-next-api';
import experiencesFile from '../../../generated/resume.json';
import resumeEmbeddings from '../../../generated/resume-embeddings.json';
import profileFile from '../../../generated/profile.json';
import rawProjects from '../../../generated/projects.json';
import rawEmbeddings from '../../../generated/projects-embeddings.json';

export type {
  ProjectRepository,
  ProjectDetailProvider,
  ExperienceRepository,
  ProfileRepository,
} from '@portfolio/chat-data';

type CachedProviders = {
  projectRepository: ProjectRepository;
  projectDetailProvider: ProjectDetailProvider;
  experienceRepository: ExperienceRepository;
  profileRepository: ProfileRepository;
};

let cachedProviders: CachedProviders | null = null;

/**
 * Returns data providers for accessing projects, resume, and profile data.
 * This is intentionally separate from the chat runtime initialization to avoid
 * triggering chat runtime creation (which requires modelConfig) on routes
 * that only need data access like /api/projects and /api/resume.
 */
export function getChatDataProviders(): CachedProviders {
  if (cachedProviders) {
    return cachedProviders;
  }

  const providers = createFilesystemChatProviders({
    projectsFile: rawProjects,
    projectEmbeddingsFile: rawEmbeddings,
    resumeFile: experiencesFile,
    resumeEmbeddingsFile: resumeEmbeddings,
    profileFile,
  });

  cachedProviders = {
    projectRepository: providers.projectRepository,
    projectDetailProvider: providers.projectDetailProvider,
    experienceRepository: providers.experienceRepository,
    profileRepository: providers.profileRepository,
  };

  return cachedProviders;
}
