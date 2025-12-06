#!/usr/bin/env tsx

/**
 * Chat Evals CLI
 *
 * Thin entry point that loads config, creates clients, and runs eval suites.
 * All logic is in tests/golden/lib/
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { getOpenAIClient } from '../src/server/openai/client';
import { createFixtureChatServer, personaFile, profileFile } from '../tests/chat-evals/fixtures/bootstrap';
import {
  RETRIEVAL_REQUEST_TOPK_DEFAULT,
  RETRIEVAL_REQUEST_TOPK_MAX,
  type ProfileSummary,
} from '@portfolio/chat-contract';
import {
  chatEvalSuites,
  createEvalClient,
  runAllSuites,
  printSummary,
  buildOutputReport,
  type EvalConfig,
} from '../tests/chat-evals';

const DEFAULT_EVAL_CONFIG: EvalConfig = {
  models: {
    plannerModel: 'gpt-4o-mini',
    answerModel: 'gpt-4o-mini',
    embeddingModel: 'text-embedding-3-small',
    judgeModel: 'gpt-4o',
    similarityModel: 'text-embedding-3-small',
  },
  timeout: { softTimeoutMs: 60000 },
  reasoning: { planner: 'minimal', answer: 'low' },
  thresholds: { minSemanticSimilarity: 0.75, minJudgeScore: 0.7 },
};

const assertRange = (value: number, min: number, max: number, name: string) => {
  if (Number.isNaN(value) || value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
};

const normalizeTopK = (value: unknown, name: string): number | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} must be a number between 1 and ${RETRIEVAL_REQUEST_TOPK_MAX}`);
  }
  const intVal = Math.floor(value);
  assertRange(intVal, 1, RETRIEVAL_REQUEST_TOPK_MAX, name);
  return intVal;
};

const normalizeWeight = (value: unknown, name: string): number | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} must be a non-negative number`);
  }
  assertRange(value, 0, 5, name);
  return value;
};

const normalizeMinRelevanceScore = (value: unknown): number | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('retrieval.minRelevanceScore must be a number between 0 and 1');
  }
  assertRange(value, 0, 1, 'retrieval.minRelevanceScore');
  return value;
};

const normalizeTokenLimit = (value: unknown, name: string): number | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} must be a positive integer`);
  }
  const intVal = Math.floor(value);
  if (intVal <= 0) {
    throw new Error(`${name} must be greater than 0`);
  }
  return intVal;
};

const normalizeTemperature = (value: unknown): number | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('models.answerTemperature must be a number between 0 and 2');
  }
  assertRange(value, 0, 2, 'models.answerTemperature');
  return value;
};

const normalizeThreshold = (value: unknown, name: string, fallback: number): number => {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} must be a number between 0 and 1`);
  }
  assertRange(value, 0, 1, name);
  return value;
};

// --- Config Loading ---

function loadEvalConfig(): EvalConfig {
  const configPath = resolve(process.cwd(), 'chat-eval.config.yml');
  if (!existsSync(configPath)) {
    console.warn('chat-eval.config.yml not found, using defaults');
    return DEFAULT_EVAL_CONFIG;
  }

  const raw = readFileSync(configPath, 'utf-8');
  const parsed = parseYaml(raw) as Partial<EvalConfig>;
  const models = parsed.models ?? {};

  const answerModel = models.answerModel?.trim();
  if (!answerModel) {
    throw new Error('chat-eval.config.yml is missing models.answerModel');
  }

  const plannerModel = models.plannerModel?.trim() || answerModel;
  const embeddingModel = models.embeddingModel?.trim() || DEFAULT_EVAL_CONFIG.models.embeddingModel;
  const judgeModel = models.judgeModel?.trim() || DEFAULT_EVAL_CONFIG.models.judgeModel;
  const similarityModel =
    models.similarityModel?.trim() || DEFAULT_EVAL_CONFIG.models.similarityModel;

  const retrievalWeights = parsed.retrieval?.weights;
  const weights = retrievalWeights
    ? {
        textWeight: normalizeWeight(retrievalWeights.textWeight, 'retrieval.weights.textWeight'),
        semanticWeight: normalizeWeight(
          retrievalWeights.semanticWeight,
          'retrieval.weights.semanticWeight'
        ),
        recencyLambda: normalizeWeight(
          retrievalWeights.recencyLambda,
          'retrieval.weights.recencyLambda'
        ),
      }
    : undefined;

  const retrieval = parsed.retrieval
    ? {
        defaultTopK: normalizeTopK(parsed.retrieval.defaultTopK, 'retrieval.defaultTopK'),
        maxTopK: normalizeTopK(parsed.retrieval.maxTopK, 'retrieval.maxTopK'),
        minRelevanceScore: normalizeMinRelevanceScore(parsed.retrieval.minRelevanceScore),
        weights: weights &&
          (weights.textWeight !== undefined ||
            weights.semanticWeight !== undefined ||
            weights.recencyLambda !== undefined)
          ? weights
          : undefined,
      }
    : undefined;

  if (retrieval?.maxTopK && retrieval.defaultTopK && retrieval.defaultTopK > retrieval.maxTopK) {
    throw new Error('retrieval.defaultTopK cannot exceed retrieval.maxTopK');
  }

  const normalizedRetrieval = retrieval
    ? {
        ...retrieval,
        defaultTopK:
          retrieval.defaultTopK ??
          (retrieval.maxTopK !== undefined
            ? Math.min(RETRIEVAL_REQUEST_TOPK_DEFAULT, retrieval.maxTopK)
            : undefined),
      }
    : undefined;

  const tokens = parsed.tokens
    ? {
        planner: normalizeTokenLimit(parsed.tokens.planner, 'tokens.planner'),
        answer: normalizeTokenLimit(parsed.tokens.answer, 'tokens.answer'),
      }
    : undefined;

  return {
    models: {
      plannerModel,
      answerModel,
      answerModelNoRetrieval: models.answerModelNoRetrieval?.trim() || undefined,
      embeddingModel,
      judgeModel,
      similarityModel,
      answerTemperature: normalizeTemperature(models.answerTemperature),
    },
    tokens,
    retrieval: normalizedRetrieval,
    timeout: {
      softTimeoutMs: normalizeTokenLimit(parsed.timeout?.softTimeoutMs, 'timeout.softTimeoutMs') ??
        DEFAULT_EVAL_CONFIG.timeout.softTimeoutMs,
    },
    reasoning: {
      planner: parsed.reasoning?.planner ?? DEFAULT_EVAL_CONFIG.reasoning.planner,
      answer: parsed.reasoning?.answer ?? DEFAULT_EVAL_CONFIG.reasoning.answer,
      answerNoRetrieval: parsed.reasoning?.answerNoRetrieval,
    },
    thresholds: {
      minSemanticSimilarity: normalizeThreshold(
        parsed.thresholds?.minSemanticSimilarity,
        'thresholds.minSemanticSimilarity',
        DEFAULT_EVAL_CONFIG.thresholds.minSemanticSimilarity
      ),
      minJudgeScore: normalizeThreshold(
        parsed.thresholds?.minJudgeScore,
        'thresholds.minJudgeScore',
        DEFAULT_EVAL_CONFIG.thresholds.minJudgeScore
      ),
    },
  };
}

// --- Main ---

async function main() {
  const config = loadEvalConfig();

  console.log('Chat Evals - Semantic Similarity + LLM-as-a-Judge\n');
  console.log('Pipeline models:', config.models.plannerModel, '/', config.models.answerModel);
  console.log('Judge model:', config.models.judgeModel);
  console.log(
    'Thresholds: similarity >=',
    config.thresholds.minSemanticSimilarity,
    ', judge >=',
    config.thresholds.minJudgeScore
  );

  const openaiClient = await getOpenAIClient();

  // Create chat API with eval config models + persona/profile for context
  // Uses frozen fixture data for stable, reproducible evals
  const { chatApi } = createFixtureChatServer({
    runtimeOptions: {
      modelConfig: {
        plannerModel: config.models.plannerModel,
        answerModel: config.models.answerModel,
        answerModelNoRetrieval: config.models.answerModelNoRetrieval,
        embeddingModel: config.models.embeddingModel,
        answerTemperature: config.models.answerTemperature,
        reasoning: config.reasoning,
      },
      tokenLimits: config.tokens,
      persona: personaFile,
      profile: profileFile as ProfileSummary,
    },
    retrievalOverrides: config.retrieval,
  });

  // Create eval client (decoupled from test logic)
  const evalClient = createEvalClient({
    openaiClient,
    chatApi,
    config,
  });

  // Run all suites
  const results = await runAllSuites(chatEvalSuites, evalClient, config);

  // Print summary
  printSummary(results);

  // Build and save output report
  const report = buildOutputReport(results, config);
  const outputDir = resolve(process.cwd(), 'tests/chat-evals/output');
  mkdirSync(outputDir, { recursive: true });

  // Generate timestamped filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputPath = join(outputDir, `eval-${timestamp}.json`);
  writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\nOutput saved to: ${outputPath}`);

  const failed = results.filter((r) => !r.passed);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('chat-evals failed', error);
  process.exit(1);
});
