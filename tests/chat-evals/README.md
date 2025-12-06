# Portfolio Chat Engine — Chat Evals

Companion to `docs/features/chat/chat-spec.md`. Eval framework lives in `tests/chat-evals/`.

---

## 1. Overview

Chat evals validate the chat pipeline using:
- **Semantic similarity** — embedding-based comparison between actual and golden responses
- **LLM-as-a-judge** — GPT scores response quality against rubric criteria

A test passes when both scores meet configured thresholds (default: similarity >= 0.75, judge >= 0.7).

---

## 2. Test Structure

Tests are multi-turn conversations with golden reference responses:

```ts
type ConversationTurn = {
  userMessage: string;
  goldenResponse: string;  // Reference response to compare against
  judgeHints?: string;     // Optional rubric hints for the judge
};

type ChatEvalTestCase = {
  id: string;
  name: string;
  description?: string;
  turns: ConversationTurn[];
};
```

Example test case (`tests/chat-evals/conversations/location-chitchat.ts`):

```ts
{
  id: 'conv-location-chitchat',
  name: 'Location chitchat',
  turns: [
    {
      userMessage: 'where u from?',
      goldenResponse: "I'm originally from Chicago...",
      judgeHints: 'Should mention Chicago origin and current Charlotte location',
    },
    {
      userMessage: 'ever been to Seattle?',
      goldenResponse: "Yeah! I worked at AWS in Seattle...",
      judgeHints: 'Should reference AWS work in Seattle',
    },
  ],
}
```

---

## 3. Frozen Fixtures

Evals use **frozen fixture data** instead of live `generated/` files. This ensures test stability when portfolio content changes.

```
tests/chat-evals/fixtures/
├── projects.json           # Frozen project catalog
├── projects-embeddings.json
├── resume.json             # Frozen resume entries
├── resume-embeddings.json
├── persona.json            # Frozen persona guidelines
├── profile.json            # Frozen profile summary
└── bootstrap.ts            # Loads fixture data into chat pipeline
```

**Why fixtures?** Golden responses reference specific facts (projects, experience, locations). When you update your portfolio, the golden responses become stale. Fixtures decouple eval stability from content changes.

**Refreshing fixtures:** When you intentionally want to update the eval baseline:

```bash
pnpm chat:evals:refresh-fixtures
```

This copies current `generated/` files to `fixtures/`. Remember to update golden responses in test cases afterward.

---

## 4. Configuration

`chat-eval.config.yml` configures models, thresholds, and retrieval:

```yaml
models:
  plannerModel: gpt-5-nano-2025-08-07
  answerModel: gpt-5-nano-2025-08-07
  judgeModel: gpt-5-mini-2025-08-07
  similarityModel: text-embedding-3-small

thresholds:
  minSemanticSimilarity: 0.75
  minJudgeScore: 0.7

retrieval:
  defaultTopK: 8
  minRelevanceScore: 0.3
```

---

## 5. Running Evals

```bash
# Run all suites
pnpm chat:evals

# With debug logging
CHAT_DEBUG_LOG=2 pnpm chat:evals > chat-evals.log
```

Output is saved to `tests/chat-evals/output/eval-{timestamp}.json`.

---

## 6. Directory Structure

```
tests/chat-evals/
├── index.ts                # Exports suites and framework
├── framework/
│   ├── types.ts            # Type definitions
│   ├── eval-client.ts      # Client wrapping chat API + OpenAI
│   ├── runner.ts           # Orchestrates multi-turn conversations
│   ├── judge.ts            # LLM-as-a-judge implementation
│   └── similarity.ts       # Semantic similarity via embeddings
├── conversations/          # Test case definitions
│   ├── location-chitchat.ts
│   └── react-experience.ts
├── fixtures/               # Frozen portfolio data
│   └── bootstrap.ts
└── output/                 # JSON reports
```

---

## 7. Adding New Tests

1. Create a new file in `tests/chat-evals/conversations/`
2. Define test cases with multi-turn conversations and golden responses
3. Export and add to suite in `tests/chat-evals/index.ts`
4. Run evals to validate

Judge hints help the LLM evaluator understand what to look for:
- Factual accuracy (specific facts that must be present)
- Tone/voice (persona consistency)
- Completeness (important points to cover)

---

## 8. Eval Flow

```
For each test:
  For each turn:
    1. Add user message to conversation history
    2. Run chat pipeline → get actual response
    3. Add response to history (for next turn context)
    4. In parallel:
       - Compute semantic similarity (embeddings)
       - Run LLM judge (JSON schema response)
    5. Pass/fail based on thresholds
  Aggregate results and costs
```

Cost tracking includes both pipeline calls (planner + answer) and eval overhead (judge + similarity embeddings).
