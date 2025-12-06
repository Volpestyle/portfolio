# Portfolio Chat Engine — Chat Evals

Companion to `docs/features/chat/chat-spec.md`. This file keeps eval coverage, chat eval schema, and a minimal runner sketch in one place. Suites live in `tests/golden/` (see `tests/golden/index.ts`).

---

## 1. Coverage Goals

- Grounding + honesty for skills, projects, experience, and bio questions.
- UI/text alignment: cards reflect Answer.uiHints and retrieved docs.
- Card presence/absence correctness (uiHints included only when relevant).
- Zero/low‑evidence honesty and transparent fallbacks.
- Persona voice consistency and “I” perspective.
- Meta/chit‑chat sanity (no generic assistant drift).

---

## 2. Chat Eval Schema

```ts
type ChatEvalTestCase = {
  id: string;
  name: string;
  category: 'skill' | 'projects' | 'experience' | 'bio' | 'meta' | 'edge_case';
  input: { userMessage: string; conversationHistory?: ChatMessage[] };
  expected?: {
    plannerQueries?: Array<{ source?: PlannerQuerySource; textIncludes?: string[]; limitAtMost?: number }>;
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
      category: 'skill',
      input: { userMessage: 'Have you used React?' },
      expected: {
        uiHintsProjectsMinCount: 1,
      },
    },
    {
      id: 'fc-no-evidence-rust',
      name: 'Skill absent',
      category: 'skill',
      input: { userMessage: 'Have you used Rust?' },
      expected: {
        uiHintsProjectsMaxCount: 0,
        answerContains: ["I don't have that in my portfolio"],
      },
    },
  ],
};

const enumerationSuite: ChatEvalSuite = {
  name: 'Enumeration',
  description: 'Lists should respect uiHints + retrieved docs',
  tests: [
    {
      id: 'enum-go-projects',
      name: 'List projects by tech',
      category: 'projects',
      input: { userMessage: 'Which projects have you used Go on?' },
      expected: {
        uiHintsProjectsMinCount: 1,
      },
    },
    {
      id: 'enum-meta',
      name: 'Meta stays n/a',
      category: 'meta',
      input: { userMessage: 'Hi there!' },
      expected: {
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
      const { plan, retrieval, answer, uiPayload } = await chatApi.run(openai, messages, {
        ownerId,
        reasoningEnabled: true,
      });

      // Assert planner output, retrieval summaries, answer text, and uiPayload alignment
      // (uiHints and required IDs when specified).
      results.push(assertChatEval(test, { plan, retrieval, answer, uiPayload }));
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

Keep assertions focused on the contract: planner queries, grounded answer text, and uiHints/card expectations.

---

## 4. Where to Look

- Full suites in `tests/golden/index.ts` (fact-check, enumeration, narrative, meta, edge cases).
- Runner wiring sits next to the chat API integration helpers.
- Metrics/grade scripts can emit JSON for dashboards; the shapes above are the expected contract.

---

## 5. Running evals locally (with logging)

Prereqs:

- `OPENAI_API_KEY` set, and `generated/` artifacts up to date (run `pnpm chat:preprocess` if needed).
- `CHAT_DEBUG_LOG` optional: `1` (default dev), `2` (includes raw queries), or `3` (same with aggressive redaction).

Commands:

- Run the suites: `pnpm chat:evals`
- Capture logs: `CHAT_DEBUG_LOG=2 pnpm chat:evals > chat-evals.log`

Notes:

- The runner uses `src/server/chat/bootstrap.ts`, so the same pipeline/logger is exercised as the app. Log output includes planner/retrieval/answer events and token spend (`chat.pipeline.tokens`). In dev, you can also open `/debug/chat` after a run to inspect the in-memory buffer.
- Cost totals in the CLI summary/report include both pipeline calls and the eval overhead (semantic-similarity embeddings + judge model).
