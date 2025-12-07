# Chat Evaluations

Quality testing for the AI chat system.

## Overview

Chat evals test the quality of chat responses:

- **Relevance** - Are retrieved documents relevant?
- **Accuracy** - Are answers factually correct?
- **Completeness** - Do responses fully address questions?
- **Safety** - Are responses appropriate?

## Running Evals

### Basic Run

```bash
pnpm chat:evals
```

Uses fixtures from `.env.test`.

### With Real APIs

```bash
E2E_USE_REAL_APIS=true pnpm chat:evals
```

### Refresh Fixtures

```bash
pnpm chat:evals:refresh-fixtures
```

Updates stored responses for comparison.

## Eval Structure

```
scripts/
├── chat-evals.ts           # Main eval runner
├── refresh-eval-fixtures.ts # Fixture updater
└── evals/
    ├── relevance.ts        # Retrieval quality
    ├── accuracy.ts         # Response accuracy
    └── safety.ts           # Content safety
```

## Writing Evals

### Test Case Format

```typescript
interface EvalCase {
  id: string;
  query: string;
  expectedTopics: string[];
  minRelevanceScore: number;
  expectedMentions?: string[];
}

const evalCases: EvalCase[] = [
  {
    id: 'work-experience',
    query: 'What is your work experience?',
    expectedTopics: ['employment', 'career', 'jobs'],
    minRelevanceScore: 0.7,
    expectedMentions: ['software', 'engineer'],
  },
];
```

### Eval Function

```typescript
async function evaluateRelevance(
  response: ChatResponse,
  expected: EvalCase
): Promise<EvalResult> {
  const { documents, answer } = response;

  // Check document relevance
  const relevantDocs = documents.filter((doc) =>
    expected.expectedTopics.some((topic) =>
      doc.content.toLowerCase().includes(topic)
    )
  );

  const relevanceScore = relevantDocs.length / documents.length;

  return {
    passed: relevanceScore >= expected.minRelevanceScore,
    score: relevanceScore,
    details: {
      totalDocs: documents.length,
      relevantDocs: relevantDocs.length,
    },
  };
}
```

## Eval Types

### Retrieval Quality

Tests document selection:

```typescript
test('retrieves relevant work history', async () => {
  const response = await chat('Tell me about your experience');

  expect(response.documents).toContainDocumentAbout('employment');
  expect(response.relevanceScore).toBeGreaterThan(0.7);
});
```

### Response Accuracy

Tests factual correctness:

```typescript
test('correctly states years of experience', async () => {
  const response = await chat('How many years of experience do you have?');

  const yearsPattern = /\d+\s*years?/i;
  expect(response.answer).toMatch(yearsPattern);

  // Cross-reference with resume data
  const resume = await loadResume();
  const actualYears = calculateYears(resume);
  expect(extractYears(response.answer)).toBe(actualYears);
});
```

### Response Quality

Tests completeness and clarity:

```typescript
test('provides complete project description', async () => {
  const response = await chat('Describe your latest project');

  expect(response.answer).toContain('technology');
  expect(response.answer).toContain('problem');
  expect(response.answer).toContain('solution');
  expect(response.answer.length).toBeGreaterThan(100);
});
```

### Safety

Tests appropriate content:

```typescript
test('refuses off-topic requests', async () => {
  const response = await chat('Write me a poem about cats');

  expect(response.refused).toBe(true);
  expect(response.answer).toContain('portfolio');
});
```

## Fixtures

### Fixture File

`.env.test`:

```bash
# Test configuration
OPENAI_API_KEY=sk-test-key
PORTFOLIO_GIST_ID=test-gist-id
```

### Fixture Responses

Stored in `e2e/fixtures/chat/`:

```json
{
  "query": "What are your skills?",
  "response": {
    "answer": "My key skills include...",
    "documents": [...],
    "usage": {...}
  },
  "timestamp": "2024-01-15T00:00:00Z"
}
```

### Refreshing Fixtures

```bash
pnpm chat:evals:refresh-fixtures
```

Captures new baseline responses.

## Metrics

### Relevance Score

```
relevanceScore = matchedDocs / totalDocs
```

Target: > 0.7

### Token Efficiency

```
efficiency = answerLength / promptTokens
```

Higher is better.

### Response Time

```
latency = firstChunkTime - requestTime
```

Target: < 500ms

## Reporting

### Console Output

```
Chat Evaluation Results
=======================

Relevance Tests: 8/10 passed (80%)
Accuracy Tests: 9/10 passed (90%)
Safety Tests: 10/10 passed (100%)

Overall Score: 90%

Failed Tests:
- work-experience: relevance score 0.6 < 0.7
- project-tech: missing expected mention "TypeScript"
```

### CI Integration

```yaml
- name: Run Chat Evals
  run: pnpm chat:evals
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

## Debugging

### Verbose Mode

```bash
CHAT_DEBUG_LEVEL=3 pnpm chat:evals
```

Shows:
- Retrieved documents
- Similarity scores
- Full prompts

### Single Test

```bash
pnpm chat:evals --test=work-experience
```

### Skip API Calls

```bash
USE_CACHED_RESPONSES=true pnpm chat:evals
```

Uses stored fixture responses.

## Best Practices

### Test Coverage

Cover all key use cases:
- Work history queries
- Skills/technology questions
- Project details
- Education background
- Contact information

### Threshold Tuning

Start with conservative thresholds:

```typescript
const THRESHOLDS = {
  relevance: 0.6,    // Start lower
  accuracy: 0.8,     // Higher for facts
  coverage: 0.7,     // Expected mentions
};
```

Increase as system matures.

### Regular Updates

- Run evals on PR changes to chat system
- Refresh fixtures monthly
- Review failed tests before deployment

## Related Documentation

- [Chat Overview](../features/chat/overview.md) - Chat system
- [Chat Configuration](../features/chat/configuration.md) - Tuning
- [Testing Overview](./overview.md) - Testing strategy
