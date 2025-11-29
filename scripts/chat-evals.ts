#!/usr/bin/env tsx

import { performance } from 'node:perf_hooks';
import type { ChatRequestMessage } from '@portfolio/chat-contract';
import { chatApi } from '../src/server/chat/bootstrap';
import { getOpenAIClient } from '../src/server/openai/client';

type EvalCase = {
  id: string;
  description: string;
  messages: ChatRequestMessage[];
  expectation: string;
};

const GOLDEN_CASES: EvalCase[] = [
  {
    id: 'rust-professional-experience',
    description: 'Checks resume grounding for Rust experience questions.',
    expectation: 'Answer should cite resume entries that mention Rust; acknowledge if usage was hobby-only.',
    messages: [{ role: 'user', content: 'Have you used Rust professionally?' }],
  },
  {
    id: 'compare-impactful-ml-projects',
    description: 'Compare two ML-heavy projects with concrete evidence.',
    expectation: 'Output should highlight at least two projects, cite their names, and describe ML stack/impact.',
    messages: [{ role: 'user', content: 'Compare your two most impactful ML projects.' }],
  },
  {
    id: 'react-experience-overview',
    description: 'React overview should cover projects + resume context.',
    expectation: 'Leans on selected evidence to summarize breadth + depth of React work.',
    messages: [{ role: 'user', content: 'Tell me about your experience with React.' }],
  },
  {
    id: 'education-schooling',
    description: 'Explicit schooling question should mention institution + degree.',
    expectation:
      'Answer cites the correct school (e.g., Iowa State University) and degree (e.g., B.S. in Software Engineering) and pulls the matching education evidence.',
    messages: [{ role: 'user', content: "Where'd you go to school?" }],
  },
  {
    id: 'chicago-follow-up',
    description: 'Follow-up about Chicago after location is established.',
    expectation:
      'Acknowledges being based in Chicago without repeating the full intro; should give a short grounded personal framing, not generic tourist facts.',
    messages: [
      { role: 'user', content: 'Where are you based?' },
      { role: 'assistant', content: "I'm based in Chicago." },
      { role: 'user', content: 'Tell me about Chicago.' },
    ],
  },
];

async function runEvaluations() {
  const client = await getOpenAIClient();
  const rows: Array<{ id: string; ms: number; evidence: number; projects: number; resume: number }> = [];

  for (const testCase of GOLDEN_CASES) {
    console.log('\n================================================');
    console.log(`Case: ${testCase.id}`);
    console.log(testCase.description);
    console.log(`Expectation: ${testCase.expectation}`);
    console.log('Prompt:', testCase.messages[testCase.messages.length - 1]?.content ?? '(no content)');

    const start = performance.now();
    const result = await chatApi.run(client, testCase.messages, { softTimeoutMs: 60000 });
    const elapsed = performance.now() - start;

    console.log(`\nAnswer (${Math.round(elapsed)} ms):\n${result.message}\n`);
    console.log('UI payload:', JSON.stringify(result.ui));
    const evidenceSelection = result.reasoningTrace?.evidence?.selectedEvidence ?? [];
    if (result.ui?.bannerText) {
      console.log('Banner:', result.ui.bannerText);
    }
    if (evidenceSelection.length) {
      const evidenceCounts = {
        totalEvidence: evidenceSelection.length,
        projectCount: evidenceSelection.filter((item) => item.source === 'project').length,
        resumeCount: evidenceSelection.filter((item) => item.source === 'resume').length,
        profileCount: evidenceSelection.filter((item) => item.source === 'profile').length,
      };
      console.log('Evidence counts:', JSON.stringify(evidenceCounts));
    }

    rows.push({
      id: testCase.id,
      ms: Math.round(elapsed),
      evidence: evidenceSelection.length,
      projects: evidenceSelection.filter((item) => item.source === 'project').length,
      resume: evidenceSelection.filter((item) => item.source === 'resume').length,
    });
  }

  console.log('\nSummary');
  console.table(rows);
}

runEvaluations().catch((error) => {
  console.error('chat-evals failed', error);
  process.exit(1);
});
