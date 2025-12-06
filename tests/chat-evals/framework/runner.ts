// Test runner - executes multi-turn conversation evals

import { performance } from 'node:perf_hooks';
import type { ChatRequestMessage } from '@portfolio/chat-contract';
import type {
  ChatEvalTestCase,
  ChatEvalSuite,
  EvalClient,
  EvalConfig,
  EvalOutputReport,
  TestResult,
  TurnEvalResult,
} from './types';

export async function runMultiTurnEval(
  test: ChatEvalTestCase,
  client: EvalClient,
  config: EvalConfig
): Promise<TestResult> {
  const conversationHistory: ChatRequestMessage[] = [];
  const turnResults: TurnEvalResult[] = [];
  const totalStart = performance.now();

  for (let i = 0; i < test.turns.length; i++) {
    const turn = test.turns[i]!;
    const turnStart = performance.now();

    // Add user message to history
    conversationHistory.push({ role: 'user', content: turn.userMessage });

    // Run pipeline with full conversation
    const response = await client.runPipeline([...conversationHistory]);
    const actualResponse = response.message;

    // Add assistant response to history for next turn
    conversationHistory.push({ role: 'assistant', content: actualResponse });

    // Evaluate: semantic similarity + LLM-as-a-judge in parallel
    const [similarityResult, judgeResult] = await Promise.all([
      client.computeSimilarity(actualResponse, turn.goldenResponse),
      client.runJudge({
        userMessage: turn.userMessage,
        actualResponse,
        goldenResponse: turn.goldenResponse,
        judgeHints: turn.judgeHints,
      }),
    ]);

    const elapsedMs = Math.round(performance.now() - turnStart);
    const semanticSimilarity = similarityResult.similarity;

    const passed =
      semanticSimilarity >= config.thresholds.minSemanticSimilarity &&
      judgeResult.score >= config.thresholds.minJudgeScore;

    const pipelineUsage = response.usage ?? [];
    const evalUsage = [
      ...(similarityResult.usage ?? []),
      ...(judgeResult.usage ? [judgeResult.usage] : []),
    ];
    const usage = [...pipelineUsage, ...evalUsage];

    const pipelineCostUsd = response.totalCostUsd ?? 0;
    const evalCostUsd = (similarityResult.costUsd ?? 0) + (judgeResult.costUsd ?? 0);
    const totalCostUsd = pipelineCostUsd + evalCostUsd;

    turnResults.push({
      turnIndex: i,
      userMessage: turn.userMessage,
      actualResponse,
      goldenResponse: turn.goldenResponse,
      semanticSimilarity,
      judgeScore: judgeResult.score,
      judgeReasoning: judgeResult.reasoning,
      passed,
      elapsedMs,
      usage: usage.length ? usage : undefined,
      totalCostUsd,
      pipelineCostUsd: pipelineCostUsd || undefined,
      evalCostUsd: evalCostUsd || undefined,
    });

    // Log turn result
    const status = passed ? 'PASS' : 'FAIL';
    const simPct = (semanticSimilarity * 100).toFixed(1);
    const judgePct = (judgeResult.score * 100).toFixed(1);
    console.log(
      `    Turn ${i + 1}: "${turn.userMessage.slice(0, 30)}..." [${status}] sim=${simPct}% judge=${judgePct}% (${elapsedMs}ms)`
    );
    if (!passed) {
      console.log(`      Judge: ${judgeResult.reasoning}`);
      console.log(`      Actual: "${actualResponse.slice(0, 100)}..."`);
    }
  }

  const allPassed = turnResults.every((t) => t.passed);
  const avgSimilarity = turnResults.reduce((sum, t) => sum + t.semanticSimilarity, 0) / turnResults.length;
  const avgJudgeScore = turnResults.reduce((sum, t) => sum + t.judgeScore, 0) / turnResults.length;
  const totalElapsedMs = Math.round(performance.now() - totalStart);

  // Aggregate token/cost metrics across all turns
  const totalTokens = turnResults.reduce((sum, t) => {
    const turnTokens = t.usage?.reduce((s, u) => s + u.totalTokens, 0) ?? 0;
    return sum + turnTokens;
  }, 0);
  const totalCostUsd = turnResults.reduce((sum, t) => sum + (t.totalCostUsd ?? 0), 0);

  return {
    testId: test.id,
    testName: test.name,
    passed: allPassed,
    turnResults,
    avgSimilarity,
    avgJudgeScore,
    totalElapsedMs,
    totalTokens,
    totalCostUsd,
  };
}

export async function runSuite(
  suite: ChatEvalSuite,
  client: EvalClient,
  config: EvalConfig
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const test of suite.tests) {
    console.log(`\n  [TEST] ${test.id} — ${test.name}`);
    if (test.description) console.log(`         ${test.description}`);

    const result = await runMultiTurnEval(test, client, config);
    results.push(result);

    const status = result.passed ? 'PASS' : 'FAIL';
    const avgSimPct = (result.avgSimilarity * 100).toFixed(1);
    const avgJudgePct = (result.avgJudgeScore * 100).toFixed(1);
    console.log(
      `  [${status}] ${test.id} — avgSim=${avgSimPct}% avgJudge=${avgJudgePct}% (${result.totalElapsedMs}ms, ${result.turnResults.length} turns)`
    );
  }

  return results;
}

export async function runAllSuites(
  suites: ChatEvalSuite[],
  client: EvalClient,
  config: EvalConfig
): Promise<TestResult[]> {
  const allResults: TestResult[] = [];

  for (const suite of suites) {
    if (suite.tests.length === 0) continue;

    console.log('\n================================================');
    console.log(`Suite: ${suite.name}`);
    console.log(suite.description);

    const suiteResults = await runSuite(suite, client, config);
    allResults.push(...suiteResults);
  }

  return allResults;
}

export function printSummary(results: TestResult[]): void {
  console.log('\n================================================');
  console.log('Summary\n');

  const summary = results.map((r) => ({
    id: r.testId,
    passed: r.passed ? 'PASS' : 'FAIL',
    turns: r.turnResults.length,
    avgSim: `${(r.avgSimilarity * 100).toFixed(0)}%`,
    avgJudge: `${(r.avgJudgeScore * 100).toFixed(0)}%`,
    failedTurns: r.turnResults.filter((t) => !t.passed).length,
    tokens: r.totalTokens,
    cost: `$${r.totalCostUsd.toFixed(4)}`,
    ms: r.totalElapsedMs,
  }));

  console.table(summary);

  // Print aggregate totals
  const totalTokens = results.reduce((sum, r) => sum + r.totalTokens, 0);
  const totalCostUsd = results.reduce((sum, r) => sum + r.totalCostUsd, 0);
  console.log(`\nTotal tokens: ${totalTokens.toLocaleString()}`);
  console.log(`Total cost: $${totalCostUsd.toFixed(4)}`);

  const failed = results.filter((r) => !r.passed);
  if (failed.length > 0) {
    console.error(`\n${failed.length} chat eval(s) failed.`);
  } else {
    console.log('\nAll evals passed!');
  }
}

export function buildOutputReport(results: TestResult[], config: EvalConfig): EvalOutputReport {
  const totalTokens = results.reduce((sum, r) => sum + r.totalTokens, 0);
  const totalCostUsd = results.reduce((sum, r) => sum + r.totalCostUsd, 0);
  const totalElapsedMs = results.reduce((sum, r) => sum + r.totalElapsedMs, 0);
  const totalTurns = results.reduce((sum, r) => sum + r.turnResults.length, 0);
  const passedTests = results.filter((r) => r.passed).length;

  const avgSimilarity = results.length > 0
    ? results.reduce((sum, r) => sum + r.avgSimilarity, 0) / results.length
    : 0;
  const avgJudgeScore = results.length > 0
    ? results.reduce((sum, r) => sum + r.avgJudgeScore, 0) / results.length
    : 0;

  return {
    timestamp: new Date().toISOString(),
    config,
    summary: {
      totalTests: results.length,
      passedTests,
      failedTests: results.length - passedTests,
      totalTurns,
      totalTokens,
      totalCostUsd,
      totalElapsedMs,
      avgSimilarity,
      avgJudgeScore,
    },
    results,
  };
}
