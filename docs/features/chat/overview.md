# Chat Feature Overview

The portfolio includes an AI-powered chat interface that can answer questions about portfolio content using Retrieval-Augmented Generation (RAG).

## Features

- **Conversational Interface** - Natural language Q&A about portfolio
- **Semantic Search** - Finds relevant context using embeddings
- **Streaming Responses** - Real-time response generation
- **Cost Tracking** - Monitors and limits OpenAI spending
- **Rate Limiting** - Prevents abuse

## How It Works

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   User      │────▶│   Query     │────▶│  Retrieve   │
│   Message   │     │   Planning  │     │  Documents  │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Stream    │◀────│   Generate  │◀────│   Build     │
│   Response  │     │   Answer    │     │   Context   │
└─────────────┘     └─────────────┘     └─────────────┘
```

### Pipeline Stages

1. **Query Planning** - Analyzes user intent
2. **Document Retrieval** - Fetches relevant portfolio content
3. **Context Building** - Assembles prompt with retrieved data
4. **Response Generation** - Streams answer from LLM

## Data Sources

The chat system uses preprocessed portfolio data:

| Source | Description |
|--------|-------------|
| `profile.json` | Personal information |
| `resume.json` | Work experience |
| `projects.json` | Project details |
| `persona.json` | AI personality |

Data is stored in GitHub gist and processed into embeddings.

## Quick Start

### 1. Configure Environment

```bash
# Required
OPENAI_API_KEY=sk-your-key
PORTFOLIO_GIST_ID=your-gist-id
GH_TOKEN=ghp_your-token
```

### 2. Generate Embeddings

```bash
pnpm chat:preprocess
```

This creates files in `generated/`:
- `profile.json`
- `resume.json`
- `projects-embeddings.json`
- `resume-embeddings.json`

### 3. Start Development

```bash
pnpm dev
```

Chat is available at the bottom-right of the page.

## Configuration

Chat behavior is configured in `chat.config.yml`:

```yaml
models:
  plannerModel: gpt-5-mini-2025-08-07
  answerModel: gpt-5-mini-2025-08-07
  embeddingModel: text-embedding-3-small

retrieval:
  defaultTopK: 8
  minRelevanceScore: 0.3
  weights:
    textWeight: 0.3
    semanticWeight: 0.5
    recencyLambda: 0.05

cost:
  budgetUsd: 10
```

See [Chat Configuration](./configuration.md) for details.

## Components

The chat system is split across packages:

| Package | Purpose |
|---------|---------|
| `@portfolio/chat-contract` | Type definitions |
| `@portfolio/chat-data` | Search and retrieval |
| `@portfolio/chat-orchestrator` | LLM integration |
| `@portfolio/chat-next-api` | API handlers |
| `@portfolio/chat-next-ui` | UI components |
| `@portfolio/chat-preprocess-cli` | Data preprocessing |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Streaming chat endpoint |

### Request Format

```json
{
  "message": "What projects have you worked on?",
  "conversationId": "optional-conversation-id"
}
```

### Response Format

Server-Sent Events stream:

```
data: {"type":"chunk","content":"I've worked on..."}
data: {"type":"chunk","content":" several projects"}
data: {"type":"done","usage":{"promptTokens":100,"completionTokens":50}}
```

## Related Documentation

- [Chat Architecture](./architecture.md) - Technical deep-dive
- [Chat Configuration](./configuration.md) - Configuration options
- [Chat Evals](../../testing/chat-evals.md) - Quality testing
