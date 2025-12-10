Visitor Visibility & Action Tracking – Implementation Plan

Goal
- Know “who is online right now” and “what they did” (page views, clicks, chat, downloads) with minimal latency, low PII leakage, and predictable costs. Fit into existing CDK stack (CloudFront + Lambda@Edge + Function URLs + DynamoDB/S3).

What to capture
- Presence: userId (or anon sessionId), lastSeenAt, route, userAgent hash, ipHash/geo (coarse), current page title/slug.
- Events: eventType (page_view, nav, click, form_submit, chat_message, download), ts, user/session ids, route, referrer, device, optional payload (bounded).
- Errors/latency (optional): client js errors, API latency samples.

Architecture (phased)
1) MVP (fast to ship, cheap):
   - Presence table (DynamoDB, TTL-based) updated by a tiny API route (Lambda) called every 60s from the client and on auth lifecycle events.
   - Event log via SQS -> DynamoDB “EventLog” table (or direct Dynamo writes for low volume). Keep payloads small, TTL for auto-retention.
2) Better analysis:
   - CloudFront Real-Time Logs (RTL) to Kinesis Data Stream -> Firehose -> S3. Include edge-set header `x-visitor-id` so RTL rows are attributable; query with Athena.
3) Managed RUM (optional):
   - CloudWatch RUM (CfnAppMonitor) for JS errors, page routes, Core Web Vitals. Inject snippet in Next layout when env is present.

CDK changes (MVP path)
- New construct (e.g., UserInsightsInfra) referenced from PortfolioStack:
  - PresenceTable (DDB): PK `pk` = userId|sessionId, SK `sk` = `presence`, attrs: lastSeen (number), route (string), uaHash, ipHash/geo, ttl. PAY_PER_REQUEST, PITR on, TTL ~30m. GSI `byLastSeen` (PK `sk`, SK `lastSeen`) for “who’s online”.
  - EventLogTable (DDB): PK `pk` = userId|sessionId, SK = ISO ts. Attrs: eventType, route, referrer, payload (map, size-capped), uaHash, ipHash/geo, ttl (90d). PAY_PER_REQUEST, PITR on. (Alternative: SQS FIFO + DLQ -> Lambda consumer -> DDB to smooth spikes; add GSI on eventType/ts for queries.)
  - (Optional RTL) CloudFront real-time log config: 1Hz, sampling 1:1, fields include edge location, c-ip, user-agent, referrer, cookie, request-id, and custom header `x-visitor-id`. Sink: Kinesis Data Stream (1–2 shards), Firehose to S3 `analytics/rtl/`, Glue/Athena table.
  - (Optional RUM) CfnAppMonitor with CW RUM app monitor name; output RUM script endpoint + appId as env for Next.js.
- Wire env:
  - baseEnv additions: PRESENCE_TABLE_NAME, EVENT_LOG_TABLE_NAME, PRESENCE_TTL_MINUTES, EVENT_TTL_DAYS, PRESENCE_HEARTBEAT_SECONDS (client poll), OPTIONAL_RUM_APP_ID, OPTIONAL_RUM_ENDPOINT.
  - buildLambdaRuntimeEnv allowlist: include the new env keys.
- IAM:
  - grantRuntimeAccess (or new helper) to allow read/write on Presence/Event tables only to API handlers that need them (not edge unless required).
  - If RTL enabled: Lambda@Edge sets `x-visitor-id`, but no DDB writes from edge; Kinesis/Firehose roles for CloudFront, Firehose->S3, optional Glue/Athena read.
- CloudFront headers:
  - Edge function injects `x-visitor-id` (hashed userId or anonymous session id) and optional `x-visitor-geo` (from CloudFront geo headers) to origin. For RTL, ensure header is in the log fields.

App/runtime changes (MVP)
- Identity/session:
  - Derive `visitorId`: authenticated userId (hash) or anonymous `v4` cookie; set via middleware (Next.js) and forward to client JS + API handlers.
- Presence API route:
  - `POST /api/presence` called every 60s and on visibilitychange/unload. Payload: route, title, client ts. Lambda writes/upserts item in PresenceTable (UpdateItem with TTL). Returns server ts.
  - De-auth hook calls presence once to mark offline (optional: store status=offline).
- Event API route:
  - `POST /api/events` batches small events (<=20). Payload: [{type, route, referrer, payload, ts}]. Lambda validates, truncates payload, writes to SQS or directly to EventLogTable.
  - Frontend helper to emit events for page_view (on route change), click (key buttons), chat_message, download.
- Admin/query APIs:
  - `GET /api/online` → query GSI `byLastSeen` where lastSeen > now - 5m; return count + top routes.
  - `GET /api/events?type=...&limit=...` → query EventLogTable by pk or by GSI (eventType/ts).
- Client:
  - Add hook `usePresenceHeartbeat(visitorId, route, title)` with `setInterval`.
  - Add event emitter wrapper to standardize payloads and throttle.

Optional RTL/RUM integration
- RTL: Enable distribution real-time logs with stream/firehose stack; add Athena table DDL in docs/testing; build QuickSight or Athena views for “active sessions” and “top pages”.
- RUM: Add env-gated snippet to `_app` or layout; configure CW RUM monitor domains to your APP_DOMAIN/alt domains.

Data retention & privacy
- Hash userId and IP; avoid storing full IP/UA. Keep TTLs short (presence 30m, events 90d). Document fields in configuration docs.
- Feature flag via env: PRESENCE_ENABLED, EVENTS_ENABLED, RTL_ENABLED, RUM_ENABLED. Default off for local unless tables are present.

Rollout steps
1) Add UserInsightsInfra construct + tables/queues (CDK), expose env outputs.
2) Wire env into PortfolioStack baseEnv + Lambda env allowlist + IAM grants.
3) Add presence/event API routes + shared middleware for visitorId cookie.
4) Add client heartbeat + event emitter hooks; instrument page_view/chat/download.
5) Add simple admin page or API for /api/online and /api/events.
6) (Optional) Enable RTL + Firehose + Athena; add dashboards/queries.
7) (Optional) Enable CloudWatch RUM monitor and layout snippet.
8) Add tests: unit for API validation, integration for Dynamo writes, and an e2e that verifies heartbeat updates lastSeen + /api/online responds.

Open questions to resolve before building
- What identifier to use (email hash? user id? anonymous cookie only)? Decide PII policy.
- Expected volume? Choose direct Dynamo vs SQS->Dynamo vs RTL pipeline.
- Do unauthenticated users need to be tracked? If yes, ensure cookie banner/consent if required.
