/**
 * Eval Fixtures Bootstrap
 *
 * Mirrors src/server/chat/bootstrap.ts but loads from frozen fixture data
 * instead of generated/ files. This ensures eval stability when portfolio
 * content changes.
 */

import { createPortfolioChatServer, type ChatApiConfig } from '@portfolio/chat-next-api';
import { getOpenAIClient } from '../../../src/server/openai/client';
import experiencesFile from './resume.json';
import resumeEmbeddings from './resume-embeddings.json';
import profileFile from './profile.json';
import personaFile from './persona.json';
import rawProjects from './projects.json';
import rawEmbeddings from './projects-embeddings.json';

type RetrievalOverrideOptions = Pick<
  ChatApiConfig['retrieval'],
  'defaultTopK' | 'maxTopK' | 'minRelevanceScore' | 'logger' | 'weights'
>;

export function createFixtureChatServer(options?: {
  runtimeOptions?: ChatApiConfig['runtimeOptions'];
  retrievalOverrides?: RetrievalOverrideOptions;
}) {
  return createPortfolioChatServer({
    projectsFile: rawProjects,
    projectEmbeddingsFile: rawEmbeddings,
    resumeFile: experiencesFile,
    resumeEmbeddingsFile: resumeEmbeddings,
    profileFile,
    personaFile,
    getEmbeddingClient: getOpenAIClient,
    runtimeOptions: options?.runtimeOptions,
    retrievalOverrides: options?.retrievalOverrides,
  });
}

const bootstrapped = createFixtureChatServer();

export const fixtureProviders = bootstrapped.providers;
export const fixtureChatApi = bootstrapped.chatApi;
export { personaFile, profileFile };
