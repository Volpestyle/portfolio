import type { ExperienceRepository, ProfileRepository, ProjectDetailProvider, ProjectRepository } from '@portfolio/chat-data';
import { chatProviders } from './bootstrap';

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

export function getChatDataProviders(): CachedProviders {
  if (cachedProviders) {
    return cachedProviders;
  }

  const { projectRepository, projectDetailProvider, experienceRepository, profileRepository } = chatProviders;

  cachedProviders = {
    projectRepository,
    projectDetailProvider,
    experienceRepository,
    profileRepository,
  };

  return cachedProviders;
}
