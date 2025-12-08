# @portfolio/chat-orchestrator

OpenAI integration and chat orchestration logic.

## Overview

This package handles the core chat pipeline:

- OpenAI API integration (GPT-4, embeddings)
- Multi-stage RAG orchestration
- Token counting and management
- Streaming response generation

## Dependencies

- `openai` - OpenAI API client
- `js-tiktoken` - Token counting
- `@portfolio/chat-contract` - Type contracts
- `@portfolio/chat-data` - Document retrieval

## Architecture

### Chat Pipeline

1. **Request Validation** - Validate incoming message
2. **Query Planning** - Determine retrieval strategy
3. **Document Retrieval** - Fetch relevant context
4. **Response Generation** - Stream LLM response

### Models

Configured in `chat.config.yml`:

```yaml
models:
  plannerModel: gpt-5-mini-2025-08-07
  answerModel: gpt-5-mini-2025-08-07
  embeddingModel: text-embedding-3-small
  reasoning:
    planner: low
    answer: low
```

## Usage

```typescript
import { createChatOrchestrator } from '@portfolio/chat-orchestrator';

const orchestrator = createChatOrchestrator({
  openaiApiKey: process.env.OPENAI_API_KEY,
  config: chatConfig,
});

// Stream response
for await (const chunk of orchestrator.chat(message, context)) {
  process.stdout.write(chunk);
}
```

## Token Management

Uses `js-tiktoken` for accurate token counting:

```yaml
tokens:
  planner: 15000
  answer: 15000
```

## Related Packages

- [@portfolio/chat-contract](../chat-contract/) - Type definitions
- [@portfolio/chat-data](../chat-data/) - Document retrieval
- [@portfolio/chat-next-api](../chat-next-api/) - API integration
