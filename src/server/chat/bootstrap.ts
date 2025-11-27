import { createChatServerLogger, createPortfolioChatServer } from '@portfolio/chat-next-api';
import { getOpenAIClient } from '@/server/openai/client';
import experiencesFile from '../../../generated/resume.json';
import resumeEmbeddings from '../../../generated/resume-embeddings.json';
import profileFile from '../../../generated/profile.json';
import personaFile from '../../../generated/persona.json';
import rawProjects from '../../../generated/projects.json';
import rawEmbeddings from '../../../generated/projects-embeddings.json';
import { loadChatConfig, resolveChatRuntimeOptions } from './config';

const chatConfig = loadChatConfig();
export const chatRuntimeOptions = resolveChatRuntimeOptions(chatConfig);

export const chatLogger = createChatServerLogger();
const resolvedOwnerId = chatRuntimeOptions?.owner?.ownerId ?? process.env.CHAT_OWNER_ID ?? 'portfolio-owner';
const runtimeOptions = {
  ...(chatRuntimeOptions ?? {}),
  logger: chatLogger,
  owner:
    chatRuntimeOptions?.owner ??
    ({
      ownerId: resolvedOwnerId,
      ownerName: 'Portfolio Owner',
      domainLabel: 'portfolio owner',
    } as const),
};

const bootstrapped = createPortfolioChatServer({
  projectsFile: rawProjects,
  projectEmbeddingsFile: rawEmbeddings,
  resumeFile: experiencesFile,
  resumeEmbeddingsFile: resumeEmbeddings,
  profileFile,
  personaFile,
  getEmbeddingClient: getOpenAIClient,
  retrievalOverrides: {
    logger: chatLogger,
  },
  runtimeOptions,
});

export const chatOwnerId = runtimeOptions.owner?.ownerId ?? runtimeOptions.ownerId ?? 'portfolio-owner';
export const chatApi = bootstrapped.chatApi;
export const chatProviders = bootstrapped.providers;
