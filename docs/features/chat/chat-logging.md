# Chat Logging & Visibility

How chat instrumentation works across environments.

## Signals we emit

- Structured chat pipeline events flow through `createChatServerLogger` from `@portfolio/chat-next-api`, which wraps `logChatDebug`. `src/server/chat/bootstrap.ts` wires that logger into both the orchestrator runtime and the retrieval layer so we capture planner/evidence/answer attempts, retrieval choices, timings, cache hits, token usage, and API error hooks (`api.chat.*`).
- Token usage logs (`chat.pipeline.tokens`) also drive the CloudWatch cost metric publisher in `packages/chat-next-api/src/server.ts` whenever `OPENAI_COST_METRICS_ENABLED=true` (see `docs/features/chat/rate-limits-and-cost-guards.md`).
- Every chat request is stamped with a correlation id (UUID) at the API entrypoint (`src/app/api/chat/route.ts`) and carried via `runWithChatLogContext` so console output and stored entries can be stitched together in CloudWatch.

## Enabling debug logs

- `CHAT_DEBUG_LOG` controls logging level (parsed from `CHAT_DEBUG_LOG` or `NEXT_PUBLIC_CHAT_DEBUG_LOG`):
  - `0`: off (production default).
  - `1`: readable (skips `.raw` payloads; development default).
  - `2`: verbose (include `.raw` model responses; suppress duplicate non-raw variants).
  - `3`: production-safe redacted logging (keeps conversation text/model outputs but redacts secret-shaped fields like keys/tokens/auth headers; still skips buffer in prod).
- `CHAT_DEBUG_LOG_LIMIT` caps the in-memory ring buffer (default 500, minimum 50) to avoid runaway memory.
- When enabled, logs are written both to the buffer (for export) and to the console with a `[chat-debug|level-X|cid:<id>]` prefix so they appear in Lambda/CloudWatch logs. The buffer is disabled in production; rely on CloudWatch output instead.

## Reading logs locally

- Console: start `next dev` and watch for `[chat-debug|level-1]` lines.
- API: `GET /api/debug/chat-logs` returns the buffer as JSON (disabled in production).
- Exporter: the `ChatDevTools` overlay (always mounted in dev) lets you export the current transcript plus buffered logs to `debug/chat-exports/<timestamp>.md` via `/api/debug/chat-export`. Files are git-ignored and safe to share with bug reports.

## Production visibility

- To ship chat trace events to CloudWatch, set `CHAT_DEBUG_LOG=1` (or `2` to include raw model outputs) in the deployed environment; the route runs on the Node runtime so console output lands in the app server log group.
- Cost visibility: enable `OPENAI_COST_METRICS_ENABLED` (plus optional `OPENAI_COST_METRIC_NAMESPACE`/`OPENAI_COST_METRIC_NAME`) to publish `EstimatedCost` per OpenAI call with a `Model` dimension and SNS alarm wiring.

## Touchpoints

- `packages/chat-next-api/src/debugLogBuffer.ts` – buffer + console emission, levels, AsyncLocalStorage context.
- `packages/chat-next-api/src/server.ts` + `src/server/chat/bootstrap.ts` – logger wiring (runtime + retrieval) and cost metric hook.
- `packages/chat-orchestrator/src/runtime/pipeline.ts` – emits `chat.pipeline.*` events (retrieval, models, tokens, timings).
- `src/app/api/chat/route.ts` – chat entry point; logs rate-limit/moderation/pipeline errors via `logChatDebug`.
- `src/app/api/debug/chat-logs/route.ts`, `src/app/api/debug/chat-export/route.ts`, `src/components/chat/ChatDevTools.tsx` – local log/export access.
