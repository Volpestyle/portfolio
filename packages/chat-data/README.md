# @portfolio/chat-data

Data layer for the chat system with semantic search capabilities using MiniSearch.

## Overview

This package provides the data access layer for chat functionality:

- Document indexing and retrieval
- Semantic search with embeddings
- Lexical search with MiniSearch
- Hybrid scoring combining multiple signals

## Dependencies

- `minisearch` - Lightweight full-text search
- `zod` - Schema validation
- `@portfolio/chat-contract` - Shared type contracts

## Features

### Hybrid Search

Combines multiple retrieval signals:

1. **Lexical Search** - Keyword matching via MiniSearch
2. **Semantic Search** - Embedding similarity scoring
3. **Recency Weighting** - Time-decay for fresher content

### Configurable Weights

From `chat.config.yml`:

```yaml
retrieval:
  defaultTopK: 8
  minRelevanceScore: 0.3
  weights:
    textWeight: 0.3
    semanticWeight: 0.5
    recencyLambda: 0.05
```

## Usage

```typescript
import { createSearchIndex, search } from '@portfolio/chat-data';

// Create search index from documents
const index = createSearchIndex(documents);

// Search with hybrid scoring
const results = search(index, {
  query: 'portfolio projects',
  topK: 8,
  embeddings: queryEmbedding,
});
```

## Related Packages

- [@portfolio/chat-contract](../chat-contract/) - Type definitions
- [@portfolio/chat-orchestrator](../chat-orchestrator/) - Uses this for retrieval
- [@portfolio/chat-preprocess-cli](../chat-preprocess-cli/) - Generates indexed data
