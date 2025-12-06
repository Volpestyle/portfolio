# Portfolio Chat Engine — Implementation Notes

Companion to `docs/features/chat/chat-spec.md`. The spec is the source of truth for behavior, invariants, and UX contracts; this file collects the concrete runtime cookbook and code pointers.

---

## 1. Runtime Guards

### 1.1 Rate Limiting (Upstash, Sliding Window)

- Limits: 5/minute, 40/hour, 120/day keyed by IP; enforced in the Next.js `/api/chat` route via Upstash Redis sliding windows.
- Missing creds or init failures: fail-closed in production; in dev, if Upstash secrets are missing the limiter is bypassed.
- Local dev toggle: `ENABLE_DEV_RATE_LIMIT=false` opts out when creds are present; otherwise limits apply in dev.
- Touchpoints: `src/lib/rate-limit.ts` and `src/app/api/chat/route.ts` (middleware wiring).

### 1.2 Cost Monitoring & Alarms

- Runtime budget guard only runs when `chat.config.yml` sets `cost.budgetUsd` to a positive number. Without that setting the guard is disabled entirely.
- Scope: runtime Planner/Retrieval/Answer calls (plus embeddings); preprocessing is tracked separately.
- Storage & signals: DynamoDB `COST_TABLE_NAME` (injected by CDK) stores month-to-date spend per env; CloudWatch publishes turn + MTD metrics; optional SNS alerts via `COST_ALERT_TOPIC_ARN` / `CHAT_COST_ALERT_TOPIC_ARN`.
- Thresholds: warn/critical/exceeded at 80%/95%/100% of the configured budget. Budget defaults to disabled unless set in config.
- Enforcement: `/api/chat` blocks new turns when the budget is exceeded; if a turn pushes the state to `exceeded` at the end of a run, the stream emits an SSE `error` with `code: "budget_exceeded"` before closing.

### 1.3 Moderation

- Input moderation (enabled via `moderation.input.enabled` + optional `model`) runs before the pipeline. Flagged requests return a 200 with `error: { code: "input_moderated" }`.
- Output moderation (enabled via `moderation.output.enabled` + optional `model`) runs on streamed answer text. Refusals return the configured `refusalMessage` and optional `refusalBanner`.
- Wiring lives in `src/app/api/chat/route.ts` and uses the settings resolved from `chat.config.yml`.

---

## 2. Pipeline & Conversation Management

- Runtime pipeline: **Planner → Retrieval → Answer**, all using the OpenAI Responses API with JSON schemas.
- Planner outputs `queries[]` and optional `topic`, built from a sliding conversation snippet, OwnerConfig, and persona; prompts live in `packages/chat-orchestrator/src/pipelinePrompts.ts`.
- Retrieval executes planner queries across projects/resume/profile using BM25 shortlist, embedding re-rank, and recency-aware scoring; profile inclusion is deterministic when requested; defaults `topK=8`, clamped to max 50; process-level caches keep searchers warm.
- Answer streams a first-person message plus optional `thoughts`, `cardReasoning` (structured inclusion/exclusion reasoning for debugging), and `uiHints.projects/experiences`; uiHints are validated against retrieved docs and clamped (default max 10 per type) before emitting UI payloads.
- Conversation truncation: sliding window keeps the latest turns within ~8k tokens, always retains the latest user message and at least 3 recent turns; max user message size 500 tokens; tiktoken-backed counts; truncation is surfaced via reasoning trace metadata.

---

## 3. Streaming & UI Plumbing

- SSE events: `stage`, `reasoning`, `ui`, `token`, `item`, `attachment`, `ui_actions`, `done`, `error`.
- Stage events fire `start/complete` for `planner`, `retrieval`, and `answer`, with meta like `topic`, `docsFound`, `sources`, `tokenCount`, and `durationMs`.
- Reasoning emits partial traces/deltas when `reasoningEnabled` is true (planner plan, retrieval summaries, answer/uiHints notes); consumers build dev tooling from these traces.
- UI derivation: filter Answer.uiHints to retrieved IDs, dedupe, and clamp (projects first up to 10 total). Empty/missing uiHints yield empty UI payloads. UI events can fire during answer streaming as soon as valid uiHints exist.
- Error semantics: always emit an `error` event before closing a broken stream. Codes include `llm_timeout`, `llm_error`, `retrieval_error`, `internal_error`, `stream_interrupted`, `rate_limited`, and `budget_exceeded`. Partial answers keep streamed tokens plus an error when interruptions occur; retries must mint a new `responseAnchorId` per spec.
- Typical sequence: `stage: planner_start` → reasoning delta(s) → `stage: planner_complete` → `stage: retrieval_start` → retrieval notes → `stage: retrieval_complete` → `stage: answer_start` → `token` + `ui` events → `stage: answer_complete` → `done`.

---

## 4. Code Pointers

- Runtime pipeline + SSE plumbing: `packages/chat-orchestrator/src/runtime/pipeline.ts`.
- Retrieval drivers and scoring: `packages/chat-orchestrator/src/runtime/retrieval.ts` and `packages/chat-data`.
- Prompts: `packages/chat-orchestrator/src/pipelinePrompts.ts`.
- Contracts & schemas: `packages/chat-contract`.
- Next.js route wiring and guards: `src/app/api/chat/route.ts` plus `src/lib/rate-limit.ts`; cost guard lives alongside the chat route utilities.
