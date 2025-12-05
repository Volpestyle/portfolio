# Portfolio Chat Engine — Implementation Notes

Companion to `docs/features/chat/chat-spec.md`. The spec is the source of truth for behavior, invariants, and UX contracts; this file collects the concrete runtime cookbook and code pointers.

---

## 1. Runtime Guards

### 1.1 Rate Limiting (Upstash, Sliding Window)

- Limits: 5/minute, 40/hour, 120/day keyed by IP; enforced in the Next.js `/api/chat` route via Upstash Redis sliding windows.
- Fail-closed behavior: missing/unknown IP or Redis errors return HTTP 503/400; quota breaches return HTTP 429 with `RateLimit-*` headers.
- Local dev: bypass when Redis creds are absent; when present, `ENABLE_DEV_RATE_LIMIT=false` opts out, otherwise limits apply even in dev.
- Touchpoints: `src/lib/rate-limit.ts` and `src/app/api/chat/route.ts` (middleware wiring).

### 1.2 Cost Monitoring & Alarms

- Monthly runtime budget guard (default `$10`, override via `CHAT_MONTHLY_BUDGET_USD`) with warn/critical/exceeded thresholds at `$8 / $9.50 / $10`.
- Scope: runtime Planner/Retrieval/Answer calls (plus embeddings); preprocessing is tracked separately.
- Storage & signals: DynamoDB item keyed by owner/env/month for month-to-date spend; CloudWatch publishes per-turn and month-to-date metrics; optional SNS topic via `COST_ALERT_TOPIC_ARN` or `CHAT_COST_ALERT_TOPIC_ARN`.
- Enforcement: the `/api/chat` route short-circuits when already over budget; if a turn crosses the limit mid-stream, the stream finishes and then emits SSE `error` with `code: "budget_exceeded"`; subsequent turns are blocked by the preflight guard.

---

## 2. Pipeline & Conversation Management

- Runtime pipeline: **Planner → Retrieval → Answer**, all using the OpenAI Responses API with JSON schemas.
- Planner outputs `queries[]` and optional `topic`, built from a sliding conversation snippet, OwnerConfig, and persona; prompts live in `packages/chat-orchestrator/src/pipelinePrompts.ts`.
- Retrieval executes planner queries across projects/resume/profile using BM25 shortlist, embedding re-rank, and recency-aware scoring; profile inclusion is deterministic when requested; defaults `topK=8`, clamped to max 50; process-level caches keep searchers warm.
- Answer streams a first-person message plus optional `thoughts` (dev-only) and `uiHints.projects/experiences`; uiHints are validated against retrieved docs and clamped (default max 10 per type) before emitting UI payloads.
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
