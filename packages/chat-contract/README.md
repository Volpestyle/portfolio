# @portfolio/chat-contract

Zod-based type contracts and validation schemas for the chat system.

## Overview

This package defines the shared data contracts used across all chat packages. It provides:

- Request/response schemas for the chat API
- Document and embedding type definitions
- Configuration schemas
- Validation utilities

## Dependencies

- `zod` - Schema definition and validation

## Usage

```typescript
import { ChatRequestSchema, ChatResponseSchema, DocumentSchema } from '@portfolio/chat-contract';

// Validate incoming chat request
const result = ChatRequestSchema.safeParse(request);
if (!result.success) {
  throw new Error('Invalid request');
}

// Type-safe access to validated data
const { message, conversationId } = result.data;
```

## Package Structure

```
src/
├── index.ts           # Main exports
├── request.ts         # Chat request schemas
├── response.ts        # Chat response schemas
├── document.ts        # Document/embedding schemas
└── config.ts          # Configuration schemas
```

## Related Packages

- [@portfolio/chat-data](../chat-data/) - Data layer consuming these contracts
- [@portfolio/chat-orchestrator](../chat-orchestrator/) - Orchestration using these contracts
- [@portfolio/chat-next-api](../chat-next-api/) - API handlers validating with these contracts
