#!/usr/bin/env tsx

import { performance } from 'node:perf_hooks';
import type OpenAI from 'openai';
import type { ChatRequestMessage } from '@portfolio/chat-contract';
import { chatApi } from '../src/server/chat/bootstrap';
import { getOpenAIClient } from '../src/server/openai/client';
import chatEvalSuites, { type ChatEvalTestCase, type ChatEvalSuite } from '../tests/golden';

type AssertionResult = {
  testId: string;
  testName: string;
  passed: boolean;
  errors: string[];
  elapsedMs: number;
};

function buildMessages(test: ChatEvalTestCase): ChatRequestMessage[] {
  const history = test.input.conversationHistory ?? [];
  return [
    ...history,
    { role: 'user', content: test.input.userMessage },
  ];
}

function assertStringContains(text: string, substrings?: string[]): string[] {
  if (!substrings?.length) return [];
  const lower = text.toLowerCase();
  return substrings.filter((snippet) => !lower.includes(snippet.toLowerCase())).map((snippet) => `Missing substring in answer: "${snippet}"`);
}

function assertStringNotContains(text: string, substrings?: string[]): string[] {
  if (!substrings?.length) return [];
  const lower = text.toLowerCase();
  return substrings.filter((snippet) => lower.includes(snippet.toLowerCase())).map((snippet) => `Answer unexpectedly contains "${snippet}"`);
}

function resolveUiIds(evidenceIds: string[] | undefined, uiIds: string[] | undefined): string[] {
  if (evidenceIds && evidenceIds.length > 0) return evidenceIds;
  if (uiIds && uiIds.length > 0) return uiIds;
  return [];
}

function assertIdInclusion(ids: string[], mustInclude?: string[], mustNotInclude?: string[]): string[] {
  const errors: string[] = [];
  if (mustInclude?.length) {
    for (const required of mustInclude) {
      if (!ids.includes(required)) {
        errors.push(`Missing required id: ${required}`);
      }
    }
  }
  if (mustNotInclude?.length) {
    for (const forbidden of mustNotInclude) {
      if (ids.includes(forbidden)) {
        errors.push(`Contains forbidden id: ${forbidden}`);
      }
    }
  }
  return errors;
}

async function runChatEvalCase(test: ChatEvalTestCase, client: OpenAI): Promise<AssertionResult> {
  const messages = buildMessages(test);
  const start = performance.now();
  const response = await chatApi.run(client, messages, { softTimeoutMs: 60000, reasoningEnabled: true });
  const elapsedMs = Math.round(performance.now() - start);

  const errors: string[] = [];
  const plan = response.reasoningTrace?.plan;
  const evidence = response.reasoningTrace?.evidence;
  const answer = response.message ?? '';
  const ui = response.ui ?? { showProjects: [], showExperiences: [] };

  if (!plan) errors.push('Missing plan in reasoningTrace');
  if (!evidence) errors.push('Missing evidence in reasoningTrace');

  if (plan) {
    if (plan.questionType !== test.expected.questionType) {
      errors.push(`questionType expected ${test.expected.questionType} but got ${plan.questionType}`);
    }
    if (test.expected.enumeration && plan.enumeration !== test.expected.enumeration) {
      errors.push(`enumeration expected ${test.expected.enumeration} but got ${plan.enumeration}`);
    }
    if (test.expected.scope && plan.scope !== test.expected.scope) {
      errors.push(`scope expected ${test.expected.scope} but got ${plan.scope}`);
    }
  }

  if (evidence) {
    if (test.expected.verdict && evidence.verdict !== test.expected.verdict) {
      errors.push(`verdict expected ${test.expected.verdict} but got ${evidence.verdict}`);
    }
    const uiHintsProjects = evidence.uiHints?.projects ?? [];
    const uiHintsExperiences = evidence.uiHints?.experiences ?? [];
    if (typeof test.expected.uiHintsProjectsMinCount === 'number' && uiHintsProjects.length < test.expected.uiHintsProjectsMinCount) {
      errors.push(`uiHints.projects count ${uiHintsProjects.length} is below min ${test.expected.uiHintsProjectsMinCount}`);
    }
    if (typeof test.expected.uiHintsProjectsMaxCount === 'number' && uiHintsProjects.length > test.expected.uiHintsProjectsMaxCount) {
      errors.push(`uiHints.projects count ${uiHintsProjects.length} exceeds max ${test.expected.uiHintsProjectsMaxCount}`);
    }
    if (
      typeof test.expected.uiHintsExperiencesMinCount === 'number' &&
      uiHintsExperiences.length < test.expected.uiHintsExperiencesMinCount
    ) {
      errors.push(
        `uiHints.experiences count ${uiHintsExperiences.length} is below min ${test.expected.uiHintsExperiencesMinCount}`
      );
    }
    if (
      typeof test.expected.uiHintsExperiencesMaxCount === 'number' &&
      uiHintsExperiences.length > test.expected.uiHintsExperiencesMaxCount
    ) {
      errors.push(
        `uiHints.experiences count ${uiHintsExperiences.length} exceeds max ${test.expected.uiHintsExperiencesMaxCount}`
      );
    }

    const projectIds = resolveUiIds(uiHintsProjects, ui.showProjects);
    const experienceIds = resolveUiIds(uiHintsExperiences, ui.showExperiences);
    errors.push(
      ...assertIdInclusion(projectIds, test.expected.mustIncludeProjectIds, test.expected.mustNotIncludeProjectIds),
      ...assertIdInclusion(experienceIds, test.expected.mustIncludeExperienceIds, undefined)
    );
  }

  errors.push(...assertStringContains(answer, test.expected.answerContains));
  errors.push(...assertStringNotContains(answer, test.expected.answerNotContains));

  return {
    testId: test.id,
    testName: test.name,
    passed: errors.length === 0,
    errors,
    elapsedMs,
  };
}

async function runChatEvalSuite(suite: ChatEvalSuite, client: OpenAI): Promise<AssertionResult[]> {
  const results: AssertionResult[] = [];
  for (const test of suite.tests) {
    const result = await runChatEvalCase(test, client);
    results.push(result);
    const status = result.passed ? 'PASS' : 'FAIL';
    console.log(`\n[${status}] ${suite.name} :: ${test.id} — ${test.name} (${result.elapsedMs} ms)`);
    if (!result.passed) {
      for (const err of result.errors) {
        console.log(`  - ${err}`);
      }
    }
  }
  return results;
}

async function runAllChatEvals() {
  const client = await getOpenAIClient();
  const allResults: AssertionResult[] = [];
  for (const suite of chatEvalSuites) {
    console.log('\n================================================');
    console.log(`Suite: ${suite.name}`);
    console.log(suite.description);
    const suiteResults = await runChatEvalSuite(suite, client);
    allResults.push(...suiteResults);
  }

  const summary = allResults.map((r) => ({
    id: r.testId,
    name: r.testName,
    passed: r.passed,
    errors: r.errors.length,
    ms: r.elapsedMs,
  }));

  console.log('\nSummary');
  console.table(summary);

  const failed = allResults.filter((r) => !r.passed);
  if (failed.length > 0) {
    console.error(`\n${failed.length} chat eval(s) failed.`);
    process.exit(1);
  }
}

runAllChatEvals().catch((error) => {
  console.error('chat-evals failed', error);
  process.exit(1);
});
