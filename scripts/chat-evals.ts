#!/usr/bin/env tsx

/**
 * Chat Evals CLI
 *
 * Thin entry point that loads config, creates clients, and runs eval suites.
 * All logic is in tests/golden/lib/
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { createChatApi } from '@portfolio/chat-next-api';
import { getOpenAIClient } from '../src/server/openai/client';
import { chatProviders } from '../src/server/chat/bootstrap';
import personaFile from '../generated/persona.json';
import profileFile from '../generated/profile.json';
import {
  chatEvalSuites,
  createEvalClient,
  runAllSuites,
  printSummary,
  buildOutputReport,
  type EvalConfig,
} from '../tests/chat-evals';

// --- Config Loading ---

function loadEvalConfig(): EvalConfig {
  const configPath = resolve(process.cwd(), 'chat-eval.config.yml');
  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = parseYaml(raw) as Partial<EvalConfig>;
    return {
      models: {
        plannerModel: parsed.models?.plannerModel ?? 'gpt-4o-mini',
        answerModel: parsed.models?.answerModel ?? 'gpt-4o-mini',
        answerModelNoRetrieval: parsed.models?.answerModelNoRetrieval,
        embeddingModel: parsed.models?.embeddingModel ?? 'text-embedding-3-small',
        judgeModel: parsed.models?.judgeModel ?? 'gpt-4o',
        similarityModel: parsed.models?.similarityModel ?? 'text-embedding-3-small',
      },
      timeout: {
        softTimeoutMs: parsed.timeout?.softTimeoutMs ?? 60000,
      },
      reasoning: {
        enabled: parsed.reasoning?.enabled ?? true,
      },
      thresholds: {
        minSemanticSimilarity: parsed.thresholds?.minSemanticSimilarity ?? 0.75,
        minJudgeScore: parsed.thresholds?.minJudgeScore ?? 0.7,
      },
    };
  } catch {
    console.warn('Could not load chat-eval.config.yml, using defaults');
    return {
      models: {
        plannerModel: 'gpt-4o-mini',
        answerModel: 'gpt-4o-mini',
        embeddingModel: 'text-embedding-3-small',
        judgeModel: 'gpt-4o',
        similarityModel: 'text-embedding-3-small',
      },
      timeout: { softTimeoutMs: 60000 },
      reasoning: { enabled: true },
      thresholds: { minSemanticSimilarity: 0.75, minJudgeScore: 0.7 },
    };
  }
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
  const chatApi = createChatApi({
    retrieval: {
      projectRepository: chatProviders.projectRepository,
      experienceRepository: chatProviders.experienceRepository,
      profileRepository: chatProviders.profileRepository,
    },
    runtimeOptions: {
      modelConfig: {
        plannerModel: config.models.plannerModel,
        answerModel: config.models.answerModel,
        answerModelNoRetrieval: config.models.answerModelNoRetrieval,
        embeddingModel: config.models.embeddingModel,
      },
      persona: personaFile,
      profile: profileFile,
    },
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
