# Chat Logging & Debugging

How to inspect chat runs in this repo.

## Runtime logger

- `createChatServerLogger` in `@portfolio/chat-next-api` captures pipeline events (stage start/complete, retrieval notes, token usage, cost, moderation) into an in-memory buffer when logging is enabled.
- Logging level is controlled by `CHAT_DEBUG_LOG` or `NEXT_PUBLIC_CHAT_DEBUG_LOG`:
  - **0** – disabled (default in production).
  - **1** – structured events only (default in dev).
  - **2** – includes `.raw` payloads (prompts, retrieved docs).
  - **3** – includes raw payloads with aggressive key redaction (`*key*`, `*token*`, `*secret*`, etc.).
- Buffer is capped by `CHAT_DEBUG_LOG_LIMIT` (default 500 entries) and is reset automatically on the first message of a new dev request.

## Dev surfaces

- **Dashboard**: `/debug/chat` (dev-only) renders the latest pipeline summary, token usage (aggregated via `summarizeTokenUsage`), and the last 50 events. In production it returns a disabled message.
- **API**: `GET /api/debug/chat-logs` returns the raw buffer in dev; responds 403 in production.

## Tips

- Set `CHAT_LOG_PROMPTS=true` if you want prompts included in the logged payloads.
- Correlation IDs (`correlationId`, `conversationId`) are attached automatically per request to help trace logs across events.
