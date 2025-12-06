// EvalClient implementation - decouples API calls from test logic

import type OpenAI from 'openai';
import type { ChatRequestMessage } from '@portfolio/chat-contract';
import type { ChatApi } from '@portfolio/chat-next-api';
import type { EvalClient, EvalConfig, JudgeInput, JudgeResult, PipelineResponse } from './types';
import { computeSemanticSimilarity } from './similarity';
import { runJudge } from './judge';

export type CreateEvalClientOptions = {
  openaiClient: OpenAI;
  chatApi: ChatApi;
  config: EvalConfig;
};

export function createEvalClient(options: CreateEvalClientOptions): EvalClient {
  const { openaiClient, chatApi, config } = options;

  return {
    async runPipeline(messages: ChatRequestMessage[]): Promise<PipelineResponse> {
      const response = await chatApi.run(openaiClient, messages, {
        softTimeoutMs: config.timeout.softTimeoutMs,
        reasoningEnabled: true,
      });

      // Map usage from ChatbotResponse to PipelineUsage format
      const usage = response.usage?.map((u) => ({
        stage: u.stage,
        model: u.model,
        promptTokens: u.usage?.promptTokens ?? 0,
        completionTokens: u.usage?.completionTokens ?? 0,
        totalTokens: u.usage?.totalTokens ?? 0,
        costUsd: u.costUsd,
      }));

      return {
        message: response.message ?? '',
        usage,
        totalCostUsd: response.totalCostUsd,
      };
    },

    async computeSimilarity(actual: string, golden: string) {
      return computeSemanticSimilarity(openaiClient, actual, golden, config.models.similarityModel);
    },

    async runJudge(input: JudgeInput): Promise<JudgeResult> {
      return runJudge(openaiClient, input, config.models.judgeModel);
    },
  };
}
