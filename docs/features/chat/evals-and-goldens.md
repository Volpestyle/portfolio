# Portfolio Chat Engine — Chat Evals

Companion to `docs/features/chat/chat-spec.md`. This file keeps eval coverage, chat eval schema, and a minimal runner sketch in one place. Suites live in `tests/golden/` (see `tests/golden/index.ts`).

---

## 1. Coverage Goals

- Fact-check questions (skills/tools/locations).
- Enumeration questions ("Which projects have you used Go on?").
- Domain/broad asks ("What AI projects have you done?").
- Meta/chit-chat sanity ("Hi", "How does this work?").
- Card/answer alignment and enumeration recall (uiHints is treated as source of truth).

---

## 2. Chat Eval Schema

```ts
type ChatEvalTestCase = {
  id: string;
  name: string;
  category: 'binary' | 'list' | 'narrative' | 'meta' | 'edge_case';
  input: {
    userMessage: string;
    conversationHistory?: ChatMessage[];
  };
  expected: {
    questionType: QuestionType;
    enumeration?: EnumerationMode;
    scope?: ExperienceScope;
    verdict?: Verdict;
    answerContains?: string[];
    answerNotContains?: string[];
    uiHintsProjectsMinCount?: number;
    uiHintsProjectsMaxCount?: number;
    uiHintsExperiencesMinCount?: number;
    uiHintsExperiencesMaxCount?: number;
    mustIncludeProjectIds?: string[];
    mustIncludeExperienceIds?: string[];
    mustNotIncludeProjectIds?: string[];
  };
};

type ChatEvalSuite = {
  name: string;
  description: string;
  tests: ChatEvalTestCase[];
};
```

### Example Suites (trimmed)

```ts
const factCheckSuite: ChatEvalSuite = {
  name: 'Fact Check',
  description: 'Binary capability questions',
  tests: [
    {
      id: 'fc-yes-react',
      name: 'Skill affirmative',
      category: 'binary',
      input: { userMessage: 'Have you used React?' },
      expected: {
        questionType: 'binary',
        enumeration: 'sample',
        verdict: 'yes',
        uiHintsProjectsMinCount: 1,
      },
    },
    {
      id: 'fc-unknown-rust',
      name: 'Skill absent',
      category: 'binary',
      input: { userMessage: 'Have you used Rust?' },
      expected: {
        questionType: 'binary',
        enumeration: 'sample',
        verdict: 'unknown', // should not invent Rust if portfolio lacks it
        uiHintsProjectsMaxCount: 0,
      },
    },
    {
      id: 'fc-location-dc-singular',
      name: 'Location fact-check with singular grounding',
      category: 'binary',
      input: { userMessage: 'Have you ever been to D.C.?' },
      expected: {
        questionType: 'binary',
        enumeration: 'sample',
        verdict: 'yes',
        uiHintsExperiencesMinCount: 1,
        uiHintsExperiencesMaxCount: 1, // exactly one D.C. internship
        // Answer must mention the specific D.C. experience (e.g., NPR internship)
        // and current location (Chicago) without filler like "related experience"
        answerContains: ['D.C.', 'Washington'], // should reference the actual location
        answerNotContains: ['related experience', 'various', 'several', 'multiple'],
      },
    },
  ],
};

const enumerationSuite: ChatEvalSuite = {
  name: 'Enumeration',
  description: 'Lists should respect uiHints + all_relevant',
  tests: [
    {
      id: 'enum-go-projects',
      name: 'List projects by tech',
      category: 'list',
      input: { userMessage: 'Which projects have you used Go on?' },
      expected: {
        questionType: 'list',
        enumeration: 'all_relevant',
        verdict: 'yes',
        uiHintsProjectsMinCount: 1,
      },
    },
    {
      id: 'enum-meta',
      name: 'Meta stays n/a',
      category: 'meta',
      input: { userMessage: 'Hi there!' },
      expected: {
        questionType: 'meta',
        verdict: 'n/a',
        uiHintsProjectsMaxCount: 0,
        uiHintsExperiencesMaxCount: 0,
      },
    },
  ],
};
```

---

## 3. Runner Sketch

```ts
async function runChatEvalSuite(chatApi: ChatApi, openai: OpenAI, ownerId: string, suite: ChatEvalSuite) {
  const results: ChatEvalResult[] = [];

  for (const test of suite.tests) {
    const messages = [
      ...(test.input.conversationHistory ?? []),
      { role: 'user' as const, content: test.input.userMessage },
    ];

    try {
      const { plan, evidence, answer, uiPayload } = await chatApi.run(openai, messages, {
        ownerId,
        reasoningEnabled: true,
      });

      // Assert plan, evidence, answer text, and uiPayload alignment
      // (counts, verdict, and required IDs when specified).
      results.push(assertChatEval(test, { plan, evidence, answer, uiPayload }));
    } catch (err) {
      results.push({
        testId: test.id,
        testName: test.name,
        passed: false,
        error: err instanceof Error ? err.message : String(err),
        assertions: [],
      });
    }
  }

  return results;
}
```

Keep assertions focused on the contract: `questionType/enumeration/scope`, `verdict/confidence`, grounded answer text, and uiHints/card expectations.

---

## 4. Where to Look

- Full suites in `tests/golden/index.ts` (fact-check, enumeration, narrative, meta, edge cases).
- Runner wiring sits next to the chat API integration helpers.
- Metrics/grade scripts can emit JSON for dashboards; the shapes above are the expected contract.
