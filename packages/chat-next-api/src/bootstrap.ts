import type OpenAI from 'openai';
import type { PersonaSummary, ProfileSummary } from '@portfolio/chat-contract';
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
    options.ownerId
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

function mergeRuntimeOptions(
  runtimeOptions: ChatApiConfig['runtimeOptions'] | undefined,
  personaSummary: PersonaSummary | undefined,
  profileSummary: ProfileSummary | undefined,
  ownerIdFallback?: string
): ChatApiConfig['runtimeOptions'] | undefined {
  const persona = runtimeOptions?.persona ?? personaSummary;

  if (!runtimeOptions && !persona && !ownerIdFallback) {
    return undefined;
  }

  const merged: ChatApiConfig['runtimeOptions'] = {
    ...(runtimeOptions ?? {}),
  };

  if (persona && !merged.persona) {
    merged.persona = persona;
  }

  if (profileSummary && !merged.profile) {
    merged.profile = profileSummary;
  }

  if (ownerIdFallback && !merged.ownerId) {
    merged.ownerId = ownerIdFallback;
  }

  return merged;
}
