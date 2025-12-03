# Portfolio Chat Engine — Implementation Notes

Companion to `docs/features/chat/chat-spec.md`. The main spec is the source of truth for behavior, invariants, and UX contracts. This file keeps the concrete runtime cookbook (guards, token windows, retrieval scoring, and streaming helpers) in one place and links to the working code paths in the repo.

---

## 1. Runtime Guards

### 1.1 Rate Limiting (Upstash, Sliding Window)

Per-IP rate limiting using Upstash Redis with sliding window algorithm (see `packages/chat-next-api` middleware).

**Rate Limits:**

| Window     | Limit        | Purpose                 |
| ---------- | ------------ | ----------------------- |
| Per minute | 5 requests   | Prevent burst abuse     |
| Per hour   | 40 requests  | Prevent sustained abuse |
| Per day    | 120 requests | Hard daily cap          |

**Local Development Bypass:**

In development, rate limiting is bypassed when Redis is not configured; when Upstash creds are present, `ENABLE_DEV_RATE_LIMIT` controls enforcement (default **true**, so limits apply unless you set it to `false`).

```ts
function shouldBypassRateLimit(): boolean {
  const isDev = process.env.NODE_ENV === 'development';
  const hasRedis = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

  if (isDev && !hasRedis) {
    console.warn('[rate-limit] Bypassing rate limiting in development (Redis not configured)');
    return true;
  }
  return false;
}

// In middleware:
if (shouldBypassRateLimit()) {
  return null; // Continue to handler without rate limit check
}
```

This allows local development without requiring Redis setup while ensuring production always has rate limiting enabled.

**Implementation:**

```ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Sliding window rate limiters
const rateLimiters = {
  perMinute: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1 m'),
    prefix: 'chat:ratelimit:minute',
    analytics: true,
  }),
  perHour: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(40, '1 h'),
    prefix: 'chat:ratelimit:hour',
    analytics: true,
  }),
  perDay: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(120, '1 d'),
    prefix: 'chat:ratelimit:day',
    analytics: true,
  }),
};

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  windowName: 'minute' | 'hour' | 'day';
};

/**
 * Check all rate limit windows for a given IP.
 * Returns the most restrictive result (first failure or tightest remaining).
 */
async function checkRateLimits(ip: string): Promise<RateLimitResult> {
  const checks = await Promise.all([
    rateLimiters.perMinute.limit(ip).then((r) => ({ ...r, windowName: 'minute' as const })),
    rateLimiters.perHour.limit(ip).then((r) => ({ ...r, windowName: 'hour' as const })),
    rateLimiters.perDay.limit(ip).then((r) => ({ ...r, windowName: 'day' as const })),
  ]);

  // Find first failure or return the tightest remaining
  for (const check of checks) {
    if (!check.success) {
      return {
        allowed: false,
        limit: check.limit,
        remaining: check.remaining,
        resetAt: new Date(check.reset),
        windowName: check.windowName,
      };
    }
  }

  // All passed; return the one with lowest remaining
  const tightest = checks.reduce((a, b) => (a.remaining / a.limit < b.remaining / b.limit ? a : b));

  return {
    allowed: true,
    limit: tightest.limit,
    remaining: tightest.remaining,
    resetAt: new Date(tightest.reset),
    windowName: tightest.windowName,
  };
}

class RateLimitError extends Error {
  constructor(
    public result: RateLimitResult,
    public retryAfterSeconds: number
  ) {
    super(`Rate limit exceeded (${result.windowName}): ${result.remaining}/${result.limit}`);
    this.name = 'RateLimitError';
  }
}
```

**Middleware Integration:**

```ts
async function rateLimitMiddleware(req: NextRequest): Promise<Response | null> {
  // Bypass in local dev when Redis is not configured
  if (shouldBypassRateLimit()) {
    return NextResponse.next();
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown';

  if (ip === 'unknown') {
    // Fail-closed: reject requests without identifiable IP
    return new Response(
      JSON.stringify({
        error: 'Unable to identify client IP',
        code: 'RATE_LIMIT_IP_UNKNOWN',
      }),
      { status: 400 }
    );
  }

  try {
    const result = await checkRateLimits(ip);

    if (!result.allowed) {
      const retryAfterSeconds = Math.ceil((result.resetAt.getTime() - Date.now()) / 1000);
      return new Response(
        JSON.stringify({
          error: `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
          code: 'RATE_LIMITED',
          window: result.windowName,
          retryAfterSeconds,
        }),
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfterSeconds),
            'X-RateLimit-Limit': String(result.limit),
            'X-RateLimit-Remaining': String(result.remaining),
            'X-RateLimit-Reset': result.resetAt.toISOString(),
          },
        }
      );
    }

    // Attach rate limit headers to successful responses and continue
    const next = NextResponse.next({
      headers: {
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': result.resetAt.toISOString(),
      },
    });
    return next;
  } catch (err) {
    // Fail-closed: Redis unavailable
    console.error('Rate limiter backend unavailable', err);
    return new Response(
      JSON.stringify({
        error: 'Service temporarily unavailable',
        code: 'RATE_LIMIT_BACKEND_UNAVAILABLE',
      }),
      { status: 503 }
    );
  }
}
```

`@portfolio/chat-next-api` also exports a `createRateLimitEnforcer` helper so apps can plug in their own limiter (Upstash, API Gateway, in-memory, etc.) while keeping `createNextChatHandler` wiring unchanged. The app is still responsible for extracting an identifier (e.g., IP) and mapping headers/status; the helper just normalizes the result shape and fails closed if the limiter throws.

**Environment Variables:**

```bash
# Required for rate limiting
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

### 1.2 Cost Monitoring & Alarms

Monthly runtime budget guard (default $10, override with `CHAT_MONTHLY_BUDGET_USD`) using DynamoDB + CloudWatch + optional SNS.

- Budget: default `$10`, warning at 80%, critical at 95%, exceeded at 100% of the configured budget.
- Scope: runtime calls only (Planner/Evidence/Answer + embedding); preprocessing is tracked separately.
- Dimensions: `OwnerId`, `Env`, `YearMonth` (e.g., `2025-11`).
- Alerting: optional single SNS topic (`COST_ALERT_TOPIC_ARN` or `CHAT_COST_ALERT_TOPIC_ARN`) receives notifications when level rises to critical/exceeded.

**Data model (per month)**

- DynamoDB table `chat-runtime-cost` (or equivalent):
  - PK: `owner_env` (e.g., `portfolio-owner|prod`)
  - SK: `year_month` (e.g., `2025-11`)
  - Attributes: `monthTotalUsd`, `turnCount`, `updatedAt`
  - TTL: 35 days past month end

**Runtime flow**

1. Compute estimated turn cost from stage usages (`estimateCostUsd`).
2. `UpdateItem` the running total.
3. Read back `monthTotalUsd`.
4. Publish CloudWatch metrics:
   - `PortfolioChat/RuntimeCostTurnUsd`
   - `PortfolioChat/RuntimeCostMtdUsd`
   - Dimensions: `OwnerId`, `Env`, `YearMonth`

```ts
type CostAlarmLevel = 'ok' | 'warning' | 'critical' | 'exceeded';

type CostCheckResult = {
  level: CostAlarmLevel;
  currentSpendUsd: number;
  budgetUsd: number;
  percentUsed: number;
  remainingUsd: number;
};

async function recordRuntimeCost({
  dynamo,
  cloudwatch,
  ownerId,
  env,
  turnCostUsd,
  now = new Date(),
}: {
  dynamo: DynamoDBClient;
  cloudwatch: CloudWatchClient;
  ownerId: string;
  env: 'dev' | 'prod';
  turnCostUsd: number;
  now?: Date;
}): Promise<CostCheckResult> {
  const yearMonth = now.toISOString().slice(0, 7); // "2025-11"
  const pk = `${ownerId}|${env}`;
  const sk = yearMonth;

  // 1) Persist running month-to-date total
  const update = await dynamo.send(
    new UpdateItemCommand({
      TableName: process.env.COST_TABLE_NAME,
      Key: { owner_env: { S: pk }, year_month: { S: sk } },
      UpdateExpression: 'ADD monthTotalUsd :delta, turnCount :one SET updatedAt = :now',
      ExpressionAttributeValues: {
        ':delta': { N: turnCostUsd.toFixed(6) },
        ':one': { N: '1' },
        ':now': { S: now.toISOString() },
      },
      ReturnValues: 'UPDATED_NEW',
    })
  );

  const monthTotalUsd = Number(update.Attributes?.monthTotalUsd?.N ?? 0);
  const budgetUsd = 10;
  const percentUsed = (monthTotalUsd / budgetUsd) * 100;

  const level: CostAlarmLevel =
    monthTotalUsd >= budgetUsd ? 'exceeded' : percentUsed >= 95 ? 'critical' : percentUsed >= 80 ? 'warning' : 'ok';

  // 2) Emit CloudWatch metrics (high-resolution)
  await cloudwatch.send(
    new PutMetricDataCommand({
      Namespace: 'PortfolioChat/Costs',
      MetricData: [
        {
          MetricName: 'RuntimeCostTurnUsd',
          Dimensions: [
            { Name: 'OwnerId', Value: ownerId },
            { Name: 'Env', Value: env },
            { Name: 'YearMonth', Value: yearMonth },
          ],
          StorageResolution: 60,
          Value: turnCostUsd,
        },
        {
          MetricName: 'RuntimeCostMtdUsd',
          Dimensions: [
            { Name: 'OwnerId', Value: ownerId },
            { Name: 'Env', Value: env },
            { Name: 'YearMonth', Value: yearMonth },
          ],
          StorageResolution: 60,
          Value: monthTotalUsd,
        },
      ],
    })
  );

  return {
    level,
    currentSpendUsd: monthTotalUsd,
    budgetUsd,
    percentUsed,
    remainingUsd: Math.max(0, budgetUsd - monthTotalUsd),
  };
}
```

**CloudWatch metrics & alerts**

- Emits `PortfolioChat/Costs` metrics for turn and month-to-date spend; level is derived from budget usage (warning 80%, critical 95%, exceeded 100%).
- Optional SNS alert when level rises to critical/exceeded via a single topic (`COST_ALERT_TOPIC_ARN` or `CHAT_COST_ALERT_TOPIC_ARN`).

**Runtime guard behavior**

- Before a turn, read the current month item; if `monthTotalUsd >= budget`, short-circuit with HTTP 429/503 and SSE `error` `code: "budget_exceeded"`.
- If a turn crosses the budget mid-stream, allow the response to finish, then emit SSE `error` `code: "budget_exceeded"`; subsequent turns are blocked by the preflight guard.

**Environment variables**

```bash
AWS_REGION=us-east-1
COST_TABLE_NAME=chat-runtime-cost
CHAT_MONTHLY_BUDGET_USD=10           # optional override
COST_ALERT_TOPIC_ARN=arn:aws:sns:... # or CHAT_COST_ALERT_TOPIC_ARN
```

Notes:

- SNS replaces Resend email for alerts.
- Preprocessing metrics remain in `generated/metrics/preprocess-<runId>.json` and do not affect runtime alarms.

---

## 2. Conversation Management (Token Windows)

### 2.1 Sliding Window & Token Budgets

Conversation history uses sliding-window truncation. See `packages/chat-orchestrator/src/runtime/pipeline.ts` for the live implementation.

| Stage        | Max Input Tokens | Max Output Tokens | Notes                             |
| ------------ | ---------------- | ----------------- | --------------------------------- |
| **Planner**  | 16,000           | 1,000             | Sliding window + system prompt    |
| **Evidence** | 12,000           | 2,000             | Includes retrieved docs           |
| **Answer**   | 16,000           | 2,000             | Sliding window + evidence context |

**Sliding Window Configuration:**

```ts
const SLIDING_WINDOW_CONFIG = {
  // Token budget for conversation history (excluding system prompt, persona, retrieved docs)
  maxConversationTokens: 8000,

  // Always keep at least this many recent turns, even if over budget
  minRecentTurns: 3,

  // Maximum tokens for a single user message
  maxUserMessageTokens: 500,

  // Notify frontend when truncation occurs
  notifyOnTruncation: true,
};
```

**Sliding Window Algorithm:**

```ts
/**
 * Apply sliding window to conversation history.
 * Keeps recent turns, drops oldest when over budget.
 */
function applySlidingWindow(
  messages: ChatMessage[],
  config: typeof SLIDING_WINDOW_CONFIG = SLIDING_WINDOW_CONFIG
): TruncationResult {
  // Group messages into turns (user + assistant pairs)
  const turns = groupIntoTurns(messages);

  // Always keep the latest user message (the one we're responding to)
  const latestUserMessage = messages.filter((m) => m.role === 'user').at(-1);
  if (latestUserMessage) {
    const userTokens = countTokens(latestUserMessage.content); // tiktoken-backed
    if (userTokens > config.maxUserMessageTokens) {
      throw new MessageTooLongError(
        `Your message is too long (${userTokens} tokens). Please keep questions under ${config.maxUserMessageTokens} tokens.`
      );
    }
  }

  // Start from most recent, add turns until budget exceeded
  const keptTurns: ConversationTurn[] = [];
  let totalTokens = 0;

  // Iterate from newest to oldest
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    const newTotal = totalTokens + turn.estimatedTokens;

    // Always keep minRecentTurns, regardless of budget
    const isRecentTurn = keptTurns.length < config.minRecentTurns;

    if (isRecentTurn || newTotal <= config.maxConversationTokens) {
      keptTurns.unshift(turn); // Add to front (maintaining chronological order)
      totalTokens = newTotal;
    } else {
      // Budget exceeded, stop adding older turns
      break;
    }
  }

  // Flatten turns back to messages
  const truncatedMessages = keptTurns.flatMap((t) => [t.user, t.assistant].filter(Boolean));
  const droppedTurns = turns.length - keptTurns.length;

  return {
    messages: truncatedMessages,
    truncated: droppedTurns > 0,
    droppedTurns,
    retainedTurns: keptTurns.length,
    totalTokens,
  };
}
```

**Token Counting:**

- Runtime uses tiktoken (o200k_base) to count tokens for history truncation (see `packages/chat-orchestrator/src/runtime/pipeline.ts#L311`), so the budgets above are enforced on true token counts rather than character-length heuristics.

Truncation is applied before Planner and Answer (Evidence only needs the latest user message). When truncation occurs, the UI should surface a subtle "context truncated" hint.

---

## 3. Retrieval Pipeline Internals

### 3.1 Profile Inclusion

Profile is a single doc; inclusion is deterministic rather than ranked.

```ts
type ProfileInclusionResult = {
  include: boolean;
  reason: 'question_type_auto_include' | 'explicit_request' | 'not_requested';
  doc: ProfileDoc;
  score: number; // 1.0 for auto-include; neutral 0.5 for explicit request
};

function resolveProfileInclusion(
  questionType: QuestionType,
  retrievalRequests: RetrievalRequest[],
  profile: ProfileDoc
): ProfileInclusionResult {
  // Auto-include for narrative and meta questions
  if (questionType === 'narrative' || questionType === 'meta') {
    return {
      include: true,
      reason: 'question_type_auto_include',
      doc: profile,
      score: 1.0, // Maximum relevance for these question types
    };
  }

  // Check if Planner explicitly requested profile
  const profileRequest = retrievalRequests.find((r) => r.source === 'profile');
  if (!profileRequest) {
    return {
      include: false,
      reason: 'not_requested',
      doc: profile,
      score: 0,
    };
  }

  return {
    include: true,
    reason: 'explicit_request',
    doc: profile,
    score: 0.5,
  };
}
```

### 3.2 Combined Scoring

```ts
type ScoringWeights = {
  bm25: number; // default 0.3
  embedding: number; // default 0.5
  recency: number; // default 0.2
};

const DEFAULT_WEIGHTS: ScoringWeights = { bm25: 0.3, embedding: 0.5, recency: 0.2 };

function combinedScore(
  bm25Score: number, // normalized 0–1
  embeddingScore: number, // cosine similarity 0–1
  recencyScore: number, // 0–1 (see below)
  weights: ScoringWeights = DEFAULT_WEIGHTS
): number {
  return weights.bm25 * bm25Score + weights.embedding * embeddingScore + weights.recency * recencyScore;
}
```

### 3.3 BM25 Search (MiniSearch)

```ts
import MiniSearch from 'minisearch';

const BM25_CONFIG = {
  k1: 1.2, // term frequency saturation
  b: 0.75, // document length normalization
};

type SearchableDoc = {
  id: string;
  searchText: string; // concatenated searchable fields
};

function createBM25Searcher(docs: SearchableDoc[]): MiniSearch<SearchableDoc> {
  const searcher = new MiniSearch<SearchableDoc>({
    fields: ['searchText'],
    storeFields: ['id'],
    searchOptions: {
      boost: { searchText: 1 },
      fuzzy: 0.2, // allow minor typos
      prefix: true, // prefix matching
    },
  });
  searcher.addAll(docs);
  return searcher;
}

function bm25Search(
  searcher: MiniSearch<SearchableDoc>,
  query: string,
  limit: number
): Array<{ id: string; score: number }> {
  const results = searcher.search(query, { limit });
  // Normalize scores to 0-1 range
  const maxScore = results.length > 0 ? results[0].score : 1;
  return results.map((r) => ({
    id: r.id,
    score: maxScore > 0 ? r.score / maxScore : 0,
  }));
}
```

### 3.4 Recency Scoring

```ts
function recencyScore(docDate: Date | null, referenceDate: Date = new Date()): number {
  if (!docDate) return 0.5; // neutral score for undated docs

  const monthsAgo = monthsBetween(docDate, referenceDate);

  // Decay function: full score for recent, decays over 5 years
  const decayMonths = 60; // 5 years
  return Math.max(0, 1 - monthsAgo / decayMonths);
}
```

- Projects: use `context.timeframe.end` (or `start` if no end).
- Experiences: use `dates.end` (or current date if `isCurrent`).

### 3.5 Enumeration Recall Handling

Enumeration mode retrieves more docs but caps what Evidence sees to avoid overflow:

```ts
const ENUMERATION_CONFIG = {
  maxRetrievalDocs: 50, // Retrieve up to 50 docs
};

if (plan.enumeration === 'all_relevant') {
  retrievalRequest.topK = Math.min(ENUMERATION_CONFIG.maxRetrievalDocs, totalDocsInSource);
}

// After retrieval, before calling Evidence:
const docsForEvidence = retrievedDocs.sort((a, b) => b._score - a._score).slice(0, ENUMERATION_CONFIG.maxRetrievalDocs);
```

Evidence and UI can reference any of the up to 50 recalled IDs; `deriveUi` validates uiHints against that set.

### 3.6 Experience Scope Filtering

```ts
function filterByExperienceScope(docs: ResumeDoc[], scope: ExperienceScope | undefined): ResumeDoc[] {
  if (!scope || scope === 'any_experience') {
    return docs; // Include all: jobs, personal projects, education, etc.
  }

  if (scope === 'employment_only') {
    // Only include ExperienceRecords that represent actual employment
    return docs.filter((doc) => {
      if (doc.kind !== 'experience') return false;
      const exp = doc as ExperienceRecord;
      // Include full_time, contract, freelance, internship; exclude other
      return (
        exp.experienceType === 'full_time' ||
        exp.experienceType === 'contract' ||
        exp.experienceType === 'freelance' ||
        exp.experienceType === 'internship'
      );
    });
  }

  return docs;
}
```

### 3.7 Resume Facet Filtering

```ts
function filterByResumeFacets(
  docs: ResumeDoc[],
  facets: Array<'experience' | 'education' | 'award' | 'skill'> | null | undefined
): ResumeDoc[] {
  if (!facets || facets.length === 0) {
    return docs; // No filtering
  }

  // Filter to only docs matching the requested facets
  return docs.filter((doc) => facets.includes(doc.kind));
}
```

### 3.8 Evidence caps, deep dives, and uiHint validation

- Evidence caps: candidates are pruned to keep the Evidence call small — up to 6 projects, 6 experiences, 4 education, 4 awards, 4 skills, and 12 total; `selectedEvidence` is capped at 6. Enumeration mode still recalls up to 50 docs before pruning (priorities favor experiences > projects > education/awards > skills).
- Deep-dive trigger for `evidenceModelDeepDive`: topic length ≥ 18 characters or doc volume ≥ 12 (or ≥ 8 when `enumeration = all_relevant`). Otherwise the default `evidenceModel` is used.
- uiHint validation: `uiHintWarnings` are emitted when Evidence returns project/experience IDs that were not in the retrieved set (warning codes `UIHINT_INVALID_PROJECT_ID` / `UIHINT_INVALID_EXPERIENCE_ID`); UI derivation filters them out.

---

## 4. Streaming & UI Plumbing

### 4.1 UI Derivation Helper

Evidence owns which cards show; `deriveUi` applies the presentation rules. See `packages/chat-orchestrator/src/runtime/pipeline.ts` for the live copy.

```ts
const MAX_DISPLAY_ITEMS = 10;

function deriveUi(
  plan: RetrievalPlan,
  evidence: EvidenceSummary,
  retrieved: RetrievedDocs // includes doc ids by source
): UiPayload {
  const cardsEnabled = plan.cardsEnabled !== false;

  if (!cardsEnabled) {
    return {
      showProjects: [],
      showExperiences: [],
      coreEvidenceIds: evidence.selectedEvidence.map((e) => e.id),
    };
  }

  let projectIds: string[] = [];
  let experienceIds: string[] = [];

  if (plan.enumeration === 'all_relevant') {
    // Enumeration uses only uiHints; no fallback.
    projectIds = evidence.uiHints?.projects ?? [];
    experienceIds = evidence.uiHints?.experiences ?? [];
  } else if (evidence.uiHints) {
    projectIds = evidence.uiHints.projects ?? [];
    experienceIds = evidence.uiHints.experiences ?? [];
  } else {
    projectIds = evidence.selectedEvidence.filter((e) => e.source === 'project').map((e) => e.id);

    // Start from resume evidence; we'll filter down to ExperienceRecord later.
    experienceIds = evidence.selectedEvidence.filter((e) => e.source === 'resume').map((e) => e.id);
  }

  // Filter against retrieved docs
  projectIds = filterToRetrievedProjects(projectIds, retrieved);
  // filterToRetrievedExperiences MUST:
  // - intersect with retrieved resume docs, AND
  // - drop any resume doc whose underlying ResumeDoc.kind !== 'experience'.
  experienceIds = filterToRetrievedExperiences(experienceIds, retrieved);

  projectIds = dedupe(projectIds);
  experienceIds = dedupe(experienceIds);

  // Truncate to display limits
  projectIds = projectIds.slice(0, MAX_DISPLAY_ITEMS);
  experienceIds = experienceIds.slice(0, MAX_DISPLAY_ITEMS - projectIds.length);

  return {
    showProjects: projectIds,
    showExperiences: experienceIds,
    coreEvidenceIds: evidence.selectedEvidence.map((e) => e.id),
  };
}
```

### 4.2 Stage Handling & Progress UI

```ts
type PipelineProgress = {
  currentStage: PipelineStage | null;
  completedStages: PipelineStage[];
  stageMeta: Record<PipelineStage, StageEvent['data']['meta']>;
  totalDurationMs: number;
};

function handleStageEvent(event: StageEvent, progress: PipelineProgress): PipelineProgress {
  const { stage, status, meta, durationMs } = event.data;

  if (status === 'start') {
    return {
      ...progress,
      currentStage: stage,
    };
  }

  // status === 'complete'
  return {
    ...progress,
    currentStage: null,
    completedStages: [...progress.completedStages, stage],
    stageMeta: {
      ...progress.stageMeta,
      [stage]: meta,
    },
    totalDurationMs: progress.totalDurationMs + (durationMs ?? 0),
  };
}
```

### 4.3 Streaming Error Backoff

```ts
type StreamState = 'idle' | 'streaming' | 'error' | 'done';

// Retry configuration
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 8000;

function exponentialBackoff(retryCount: number): number {
  const delay = BASE_DELAY_MS * Math.pow(2, retryCount);
  // Add jitter (±20%) to prevent thundering herd
  const jitter = delay * 0.2 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, MAX_DELAY_MS);
}
```

Use new `responseAnchorId` on retries; keep `conversationId` stable per thread. Emit SSE `error` before closing streams; preserve partial answer text client-side.

---

## 5. Code Pointers

- Sliding window, SSE plumbing, and UI derivation live in `packages/chat-orchestrator/src/runtime/pipeline.ts`.
- Retrieval scoring and recency live in `packages/chat-data/src/search/createSearcher.ts`.
- Prompts are defined in `packages/chat-orchestrator/src/pipelinePrompts.ts` (referenced by the main spec).
