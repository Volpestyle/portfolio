import { createChatServerLogger, createPortfolioChatServer, setRuntimeCostBudget } from '@portfolio/chat-next-api';
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
  resolveCostBudget,
  resolveChatProvider,
  type ResolvedModerationOptions,
} from './config';

const chatConfig = loadChatConfig();
export const chatProvider = resolveChatProvider(chatConfig);
export const chatRuntimeOptions = resolveChatRuntimeOptions(chatConfig);
export const chatModerationOptions: ResolvedModerationOptions | undefined = resolveModerationOptions(chatConfig);
const configuredBudgetUsd = resolveCostBudget(chatConfig);
setRuntimeCostBudget(configuredBudgetUsd);

export const chatLogger = createChatServerLogger();
const runtimeOptions = {
  ...(chatRuntimeOptions ?? {}),
  logger: chatLogger,
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

export const chatApi = bootstrapped.chatApi;
export const chatProviders = bootstrapped.providers;
