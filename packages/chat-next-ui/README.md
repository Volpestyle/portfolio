# @portfolio/chat-next-ui

React components and hooks for the chat UI.

## Overview

This package provides the frontend chat experience:

- React hooks for chat state management
- Streaming response parsing
- UI component utilities

## Dependencies

- `eventsource-parser` - SSE stream parsing
- `@portfolio/chat-contract` - Type definitions
- `@portfolio/chat-orchestrator` - Response types

## Peer Dependencies

- `react` (^18.0.0 || ^19.0.0)
- `react-dom` (^18.0.0 || ^19.0.0)

## Features

### Streaming Support

Parses Server-Sent Events for real-time response rendering:

```typescript
import { useChat } from '@portfolio/chat-next-ui';

function ChatComponent() {
  const { messages, sendMessage, isStreaming } = useChat();

  return (
    <div>
      {messages.map((msg) => (
        <ChatMessage key={msg.id} message={msg} />
      ))}
      {isStreaming && <LoadingIndicator />}
    </div>
  );
}
```

### Message State

Manages conversation history, loading states, and error handling.

## Integration

Used by the main app's chat components in `src/components/chat/`.

## Related Packages

- [@portfolio/chat-contract](../chat-contract/) - Message types
- [@portfolio/chat-next-api](../chat-next-api/) - API integration
