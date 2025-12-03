# Rate Limits & OpenAI Cost Guardrails

This stack ships with two defensive controls for the chat service:

- **Server-side rate limiting** using Upstash Redis (per IP).
- **OpenAI cost tracking + 30-day alarm** published to CloudWatch.

## Rate limiting (fail-closed)

- Limits: **5/minute**, **40/hour**, **120/day** keyed by IP.
- Backend: Upstash Redis via `@upstash/ratelimit` sliding windows.
- Behavior:
  - On quota breach: HTTP 429 with `RateLimit-*` headers.
  - On limiter backend unavailability (missing secrets or Redis error): **fail closed** with HTTP 503 to avoid unthrottled spikes.
- Config:
  - Secrets: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (Secrets Manager, repo scope).
  - Local toggle: `ENABLE_DEV_RATE_LIMIT` defaults to **true** when creds are present; set it to `false` to bypass in dev. If secrets are missing in dev, rate limiting is bypassed automatically.
- Touchpoints: `src/lib/rate-limit.ts`, enforced in `src/app/api/chat/route.ts`.

## OpenAI cost metrics & alarm

- Per-call cost is estimated from OpenAI usage and published to CloudWatch as `EstimatedCost` (USD, normalized per 1K tokens) with a `Model` dimension.
- Env flags:
  - `OPENAI_COST_METRICS_ENABLED=true` – enable publishing.
  - `OPENAI_COST_METRIC_NAMESPACE` / `OPENAI_COST_METRIC_NAME` – optional overrides (defaults: `PortfolioChat/OpenAI`, `EstimatedCost`).
- Alarm:
  - Rolling sum of the past **30** one-day data points.
  - Threshold: **$10** over the trailing 30 days (per infra stack).
  - Notifications: SNS email from `OPENAI_COST_ALERT_EMAIL`.
  - Missing-data guard: secondary alarm fires if no data points arrive for 3 consecutive days so we notice when publishing breaks.
- Runtime budget guard (separate from the CloudWatch alarm) tracks month-to-date spend via Dynamo and optional SNS topic; see `docs/features/chat/implementation-notes.md#12-cost-monitoring--alarms` for `CHAT_MONTHLY_BUDGET_USD` and `COST_ALERT_TOPIC_ARN`.
- Touchpoints: `packages/chat-next-api/src/costMetrics.ts` (publisher invoked from `createChatServerLogger` when `chat.pipeline.tokens` fire), `packages/chat-next-api/src/server.ts` (logger hook), `infra/cdk/lib/portfolio-stack.ts#createOpenAiCostAlarm` (alarm wiring + missing-data alert).

## Ops quick checks

- Rate limit health: confirm Upstash secrets are present and `/api/chat` returns 429s on burst; 503 if Redis is unreachable (expected fail-closed).
- Cost visibility: verify `OPENAI_COST_METRICS_ENABLED` is set and the CloudWatch metric shows per-call costs; alarm should reflect a true 30-day sum (not a single-day spike).
