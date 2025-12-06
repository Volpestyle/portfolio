import { createChatServerLogger, createPortfolioChatServer } from '@portfolio/chat-next-api';
import { getOpenAIClient } from '@/server/openai/client';
import experiencesFile from '../../../generated/resume.json';
import resumeEmbeddings from '../../../generated/resume-embeddings.json';
import profileFile from '../../../generated/profile.json';
import personaFile from '../../../generated/persona.json';
import rawProjects from '../../../generated/projects.json';
import rawEmbeddings from '../../../generated/projects-embeddings.json';
import {
  loadChatConfig,
  resolveChatRuntimeOptions,
  resolveRetrievalOverrides,
  resolveModerationOptions,
  type ResolvedModerationOptions,
} from './config';

const chatConfig = loadChatConfig();
export const chatRuntimeOptions = resolveChatRuntimeOptions(chatConfig);
export const chatModerationOptions: ResolvedModerationOptions | undefined = resolveModerationOptions(chatConfig);

export const chatLogger = createChatServerLogger();
const resolvedOwnerId = chatRuntimeOptions?.ownerId ?? process.env.CHAT_OWNER_ID ?? 'portfolio-owner';
const runtimeOptions = {
  ...(chatRuntimeOptions ?? {}),
  logger: chatLogger,
  ownerId: resolvedOwnerId,
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
    ...(resolveRetrievalOverrides(chatConfig) ?? {}),
  },
  runtimeOptions,
});

export const chatOwnerId = runtimeOptions.ownerId ?? 'portfolio-owner';
export const chatApi = bootstrapped.chatApi;
export const chatProviders = bootstrapped.providers;
