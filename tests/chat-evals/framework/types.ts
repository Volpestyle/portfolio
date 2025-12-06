// Shared types for chat evals

import type { ChatRequestMessage } from '@portfolio/chat-contract';

// --- Config ---

export type EvalConfig = {
  models: {
    plannerModel: string;
    answerModel: string;
    answerModelNoRetrieval?: string;
    embeddingModel: string;
    judgeModel: string;
    similarityModel: string;
  };
  timeout: {
    softTimeoutMs: number;
  };
  reasoning: {
    enabled: boolean;
  };
  thresholds: {
    minSemanticSimilarity: number;
    minJudgeScore: number;
  };
};

// --- Test Case Definitions ---

export type ConversationTurn = {
  userMessage: string;
  /** Golden reference response to compare against */
  goldenResponse: string;
  /** Optional rubric hints for the judge */
  judgeHints?: string;
};

export type ChatEvalTestCase = {
  id: string;
  name: string;
  description?: string;
  turns: ConversationTurn[];
};

export type ChatEvalSuite = {
  name: string;
  description: string;
  tests: ChatEvalTestCase[];
};

// --- Eval Results ---

export type JudgeResult = {
  score: number;
  reasoning: string;
};

export type TurnEvalResult = {
  turnIndex: number;
  userMessage: string;
  actualResponse: string;
  goldenResponse: string;
  semanticSimilarity: number;
  judgeScore: number;
  judgeReasoning: string;
  passed: boolean;
  elapsedMs: number;
  // Token/cost metrics
  usage?: PipelineUsage[];
  totalCostUsd?: number;
};

export type TestResult = {
  testId: string;
  testName: string;
  passed: boolean;
  turnResults: TurnEvalResult[];
  avgSimilarity: number;
  avgJudgeScore: number;
  totalElapsedMs: number;
  // Aggregate token/cost metrics
  totalTokens: number;
  totalCostUsd: number;
};

// --- Pipeline Response (minimal interface) ---

export type PipelineUsage = {
  stage: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd?: number;
};

export type PipelineResponse = {
  message: string;
  usage?: PipelineUsage[];
  totalCostUsd?: number;
};

// --- Eval Client Interface ---

export type EvalClient = {
  /** Run the chat pipeline with conversation history */
  runPipeline(messages: ChatRequestMessage[]): Promise<PipelineResponse>;
  /** Compute semantic similarity between two texts (0-1) */
  computeSimilarity(actual: string, golden: string): Promise<number>;
  /** Run LLM-as-a-judge to score the response */
  runJudge(input: JudgeInput): Promise<JudgeResult>;
};

export type JudgeInput = {
  userMessage: string;
  actualResponse: string;
  goldenResponse: string;
  judgeHints?: string;
};

// --- Eval Output Report ---

export type EvalOutputReport = {
  timestamp: string;
  config: EvalConfig;
  summary: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    totalTurns: number;
    totalTokens: number;
    totalCostUsd: number;
    totalElapsedMs: number;
    avgSimilarity: number;
    avgJudgeScore: number;
  };
  results: TestResult[];
};
