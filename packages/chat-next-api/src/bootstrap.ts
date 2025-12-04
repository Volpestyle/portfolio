import type OpenAI from 'openai';
import type { OwnerConfig, PersonaSummary, ProfileSummary } from '@portfolio/chat-contract';
import {
  createFilesystemProjectRepository,
  createFilesystemExperienceRepository,
  createFilesystemProfileRepository,
  createProjectDetailProvider,
  assertProfileSummary,
  type ProjectRepository,
  type ExperienceRepository,
  type ProfileRepository,
} from '@portfolio/chat-data';
import { createChatApi, type ChatApi, type ChatApiConfig } from './index';
import { createSemanticRanker } from './semanticRanking';
import { createExperienceSemanticRanker } from './experienceSemanticRanking';
import type { IdentityContext } from '@portfolio/chat-orchestrator';

export type FilesystemChatProviderOptions = {
  projectsFile: unknown;
  projectEmbeddingsFile?: unknown;
  resumeFile: unknown;
  resumeEmbeddingsFile?: unknown;
  profileFile: unknown;
};

export type ChatBootstrapOptions = FilesystemChatProviderOptions & {
  getEmbeddingClient?: () => Promise<OpenAI | null>;
  runtimeOptions?: ChatApiConfig['runtimeOptions'];
  retrievalOverrides?: Pick<
    ChatApiConfig['retrieval'],
    'defaultTopK' | 'maxTopK' | 'minRelevanceScore' | 'logger' | 'weights'
  >;
  personaFile?: unknown;
  owner?: OwnerConfig;
  ownerId?: string;
};

export type BootstrapResult = {
  providers: {
    projectRepository: ProjectRepository;
    experienceRepository: ExperienceRepository;
    profileRepository: ProfileRepository;
    projectDetailProvider: ReturnType<typeof createProjectDetailProvider>;
  };
  chatApi: ChatApi;
};

export function createFilesystemChatProviders(options: FilesystemChatProviderOptions): BootstrapResult['providers'] {
  const projectRepository = createFilesystemProjectRepository({
    datasetFile: options.projectsFile,
    embeddingsFile: options.projectEmbeddingsFile,
  });
  const experienceRepository = createFilesystemExperienceRepository({
    datasetFile: options.resumeFile,
    embeddingsFile: options.resumeEmbeddingsFile,
  });
  const profileRepository = createFilesystemProfileRepository({
    profileFile: options.profileFile,
  });
  const projectDetailProvider = createProjectDetailProvider({ repository: projectRepository });

  return {
    projectRepository,
    experienceRepository,
    profileRepository,
    projectDetailProvider,
  };
}

export function createPortfolioChatServer(options: ChatBootstrapOptions): BootstrapResult {
  const providers = createFilesystemChatProviders(options);
  const profileSummary = safeProfileSummary(options.profileFile);
  const personaSummary = resolvePersonaSummary(options.personaFile);
  const runtimeOptions = mergeRuntimeOptions(
    options.runtimeOptions,
    personaSummary,
    profileSummary,
    options.owner,
    options.owner?.ownerId ?? options.ownerId
  );

  const embeddingModel = runtimeOptions?.modelConfig?.embeddingModel;

  const projectSemanticRanker = createSemanticRanker({
    projectRepository: providers.projectRepository,
    getEmbeddingClient: options.getEmbeddingClient,
    embeddingModel,
  });

  const experienceSemanticRanker = createExperienceSemanticRanker({
    experienceRepository: providers.experienceRepository,
    getEmbeddingClient: options.getEmbeddingClient,
    embeddingModel,
  });

  const chatApi = createChatApi({
    retrieval: {
      projectRepository: providers.projectRepository,
      experienceRepository: providers.experienceRepository,
      profileRepository: providers.profileRepository,
      projectSemanticRanker,
      experienceSemanticRanker,
      defaultTopK: options.retrievalOverrides?.defaultTopK,
      maxTopK: options.retrievalOverrides?.maxTopK,
      minRelevanceScore: options.retrievalOverrides?.minRelevanceScore,
      logger: options.retrievalOverrides?.logger,
      weights: options.retrievalOverrides?.weights,
    },
    runtimeOptions,
  });

  return { chatApi, providers };
}

function resolvePersonaSummary(raw: unknown): PersonaSummary | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const candidate = raw as PersonaSummary & { persona?: PersonaSummary };
  if (candidate.persona && typeof candidate.persona.systemPersona === 'string') {
    return candidate.persona;
  }
  if (typeof candidate.systemPersona === 'string') {
    return candidate;
  }
  return undefined;
}

function safeProfileSummary(raw: unknown): ProfileSummary | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    return assertProfileSummary(raw);
  } catch (error) {
    console.warn('[ChatBootstrap] Failed to parse profile summary for identity context', error);
    return undefined;
  }
}

function buildIdentityContext(profile?: ProfileSummary, persona?: PersonaSummary): IdentityContext | undefined {
  const personaProfile = persona?.profile;
  const sourceProfile =
    profile ??
    (personaProfile
      ? {
          fullName: personaProfile.fullName,
          headline: personaProfile.headline,
          location: personaProfile.location,
          shortAbout: personaProfile.about?.[0],
        }
      : undefined);

  if (!sourceProfile && !persona) {
    return undefined;
  }

  return {
    fullName: sourceProfile?.fullName,
    headline: sourceProfile?.headline,
    location: sourceProfile?.location,
    shortAbout: persona?.shortAbout ?? sourceProfile?.shortAbout,
  };
}

function mergeRuntimeOptions(
  runtimeOptions: ChatApiConfig['runtimeOptions'] | undefined,
  personaSummary: PersonaSummary | undefined,
  profileSummary: ProfileSummary | undefined,
  ownerFallback?: OwnerConfig,
  ownerIdFallback?: string
): ChatApiConfig['runtimeOptions'] | undefined {
  const persona = runtimeOptions?.persona ?? personaSummary;
  const identityContext = runtimeOptions?.identityContext ?? buildIdentityContext(profileSummary, persona);

  if (!runtimeOptions && !persona && !identityContext && !ownerFallback && !ownerIdFallback) {
    return undefined;
  }

  const merged: ChatApiConfig['runtimeOptions'] = {
    ...(runtimeOptions ?? {}),
  };

  if (persona && !merged.persona) {
    merged.persona = persona;
  }

  if (identityContext && !merged.identityContext) {
    merged.identityContext = identityContext;
  }

  if (ownerFallback && !merged.owner) {
    merged.owner = ownerFallback;
  }

  if (ownerIdFallback && !merged.ownerId) {
    merged.ownerId = ownerIdFallback;
  }

  return merged;
}
