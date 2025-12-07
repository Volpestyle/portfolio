# @portfolio/chat-next-api

Next.js API route handlers for the chat system.

## Overview

This package provides production-ready API handlers:

- Streaming chat endpoint
- Cost tracking and budgeting
- CloudWatch metrics publishing
- SNS notifications for alerts

## Dependencies

- `@aws-sdk/client-cloudwatch` - Metrics publishing
- `@aws-sdk/client-dynamodb` - Cost tracking storage
- `@aws-sdk/client-sns` - Alert notifications
- `@portfolio/chat-contract` - Type validation
- `@portfolio/chat-orchestrator` - Chat logic

## Peer Dependencies

- `next` (^14.0.0 || ^15.0.0)
- `openai` (^6.9.1)

## Features

### Streaming Responses

Uses Lambda Function URLs with response streaming for real-time chat.

### Cost Tracking

- Per-request cost calculation
- Monthly budget enforcement
- DynamoDB-backed aggregation
- CloudWatch metrics for monitoring

### Budget Configuration

From `chat.config.yml`:

```yaml
cost:
  budgetUsd: 10
```

## Usage

```typescript
// src/app/api/chat/route.ts
import { createChatHandler } from '@portfolio/chat-next-api';

export const POST = createChatHandler({
  config: chatConfig,
  documents: loadedDocuments,
});
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Streaming chat endpoint |

## Related Packages

- [@portfolio/chat-contract](../chat-contract/) - Request validation
- [@portfolio/chat-orchestrator](../chat-orchestrator/) - Chat logic
- [@portfolio/chat-next-ui](../chat-next-ui/) - Frontend integration
