# Chat Configuration

Complete reference for chat system configuration.

## Configuration File

Chat is configured via `chat.config.yml` in the project root:

```yaml
models:
  plannerModel: gpt-5-mini-2025-08-07
  answerModel: gpt-5-mini-2025-08-07
  embeddingModel: text-embedding-3-small
  reasoning:
    planner: low
    answer: low

tokens:
  planner: 15000
  answer: 15000

retrieval:
  defaultTopK: 8
  maxTopK: 10
  minRelevanceScore: 0.3
  weights:
    textWeight: 0.3
    semanticWeight: 0.5
    recencyLambda: 0.05

moderation:
  input:
    enabled: false
  output:
    enabled: false

cost:
  budgetUsd: 10
```

## Model Configuration

### Available Models

| Setting | Description | Default |
|---------|-------------|---------|
| `plannerModel` | Model for query planning | gpt-5-mini-2025-08-07 |
| `answerModel` | Model for response generation | gpt-5-mini-2025-08-07 |
| `embeddingModel` | Model for embeddings | text-embedding-3-small |

### Reasoning Levels

Control reasoning depth:

| Level | Description |
|-------|-------------|
| `minimal` | Fastest, least reasoning |
| `low` | Basic reasoning |
| `medium` | Moderate reasoning |
| `high` | Deep reasoning |

```yaml
reasoning:
  planner: low    # Query planning reasoning
  answer: low     # Response generation reasoning
```

## Token Limits

Maximum tokens per stage:

```yaml
tokens:
  planner: 15000  # Query planning budget
  answer: 15000   # Response generation budget
```

These limits prevent runaway API costs.

## Retrieval Configuration

### Document Retrieval

```yaml
retrieval:
  defaultTopK: 8      # Default documents to retrieve
  maxTopK: 10         # Maximum allowed
  minRelevanceScore: 0.3  # Minimum relevance threshold
```

### Scoring Weights

Control how documents are ranked:

```yaml
weights:
  textWeight: 0.3       # Lexical match importance
  semanticWeight: 0.5   # Semantic similarity importance
  recencyLambda: 0.05   # Time decay factor
```

**textWeight**: Higher values favor exact keyword matches.

**semanticWeight**: Higher values favor semantic similarity.

**recencyLambda**: Higher values favor newer content. Set to 0 to disable time decay.

### Relevance Scoring

Documents with scores below `minRelevanceScore` (as a fraction of the top result) are excluded:

- `0.3` = Keep docs scoring at least 30% of top match
- `0.5` = Keep docs scoring at least 50% of top match
- `0` = Keep all retrieved documents

## Moderation

### Input Moderation

Check user messages before processing:

```yaml
moderation:
  input:
    enabled: true
    model: omni-moderation-latest
```

### Output Moderation

Check generated responses before sending:

```yaml
moderation:
  output:
    enabled: true
    model: omni-moderation-latest
    refusalMessage: "I can only answer questions about my portfolio."
    refusalBanner: "That request was blocked by my safety filters."
```

## Cost Management

### Monthly Budget

```yaml
cost:
  budgetUsd: 10  # Maximum monthly spend
```

When budget is reached:
- New requests return 503 error
- CloudWatch alarm triggers
- Email notification sent (if configured)

### Disabling Budget

Omit the `cost` section to disable budget checks:

```yaml
# cost:
#   budgetUsd: 10
```

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `CHAT_DEBUG_LEVEL` | Debug verbosity (0-3) | 0 |
| `OPENAI_COST_METRICS_ENABLED` | Enable CloudWatch metrics | false |
| `OPENAI_COST_METRIC_NAMESPACE` | CloudWatch namespace | PortfolioChat/OpenAI |
| `OPENAI_COST_METRIC_NAME` | Metric name | EstimatedCost |
| `OPENAI_COST_ALERT_EMAIL` | Alert email address | - |

### Rate Limiting

| Variable | Description |
|----------|-------------|
| `UPSTASH_REDIS_REST_URL` | Redis URL for rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Redis auth token |
| `ENABLE_DEV_RATE_LIMIT` | Enable rate limiting in dev |

## Debug Configuration

Enable verbose logging:

```bash
CHAT_DEBUG_LEVEL=3 pnpm dev
```

| Level | Output |
|-------|--------|
| 0 | Disabled |
| 1 | Basic request/response |
| 2 | Include retrieval info |
| 3 | Full pipeline debug |

## Preprocessing Configuration

Control preprocessing tasks:

```bash
CHAT_PREPROCESS_TASKS='profile,persona' pnpm chat:preprocess
```

Available tasks:
- `profile` - Portfolio profile
- `persona` - AI persona
- `projects` - Project embeddings
- `resume` - Resume embeddings

## Example Configurations

### Development

```yaml
models:
  plannerModel: gpt-4o-mini
  answerModel: gpt-4o-mini
  embeddingModel: text-embedding-3-small

retrieval:
  defaultTopK: 5
  minRelevanceScore: 0.2

moderation:
  input:
    enabled: false
  output:
    enabled: false

cost:
  budgetUsd: 5
```

### Production

```yaml
models:
  plannerModel: gpt-5-mini-2025-08-07
  answerModel: gpt-5-mini-2025-08-07
  embeddingModel: text-embedding-3-small
  reasoning:
    planner: low
    answer: low

retrieval:
  defaultTopK: 8
  maxTopK: 10
  minRelevanceScore: 0.3
  weights:
    textWeight: 0.3
    semanticWeight: 0.5
    recencyLambda: 0.05

moderation:
  input:
    enabled: true
  output:
    enabled: true
    refusalMessage: "I can only discuss portfolio-related topics."

cost:
  budgetUsd: 10
```
