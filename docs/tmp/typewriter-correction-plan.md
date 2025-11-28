# Typewriter stream correction plan

Goal: keep the UI typing in real time with the SSE stream, even when the backend emits a single big token or finishes quickly.

## Current failure
- SSE can send the full answer as one `token` followed by `done` in the same tick.
- `useChatStream` appends the token and immediately marks `animated=false`; `ChatThread` clears `streamingAssistantMessageId`.
- `TypewriterMessage` sees `streaming=false` with a full target, so it replays after completion instead of during the stream.

## Fix blueprint
1) **Guarantee multiple token frames server-side**
   - In `packages/chat-next-api/src/stream.ts`, always chunk outbound text into smaller tokens before emitting. Use `chunkText(result.message, 32–48)` and avoid emitting a single giant token from `onAnswerToken`.
2) **Don’t end the stream in the same tick**
   - Defer `done` until after the last token has flushed (microtask or next frame). If moderation buffers tokens, flush them before `done`.
3) **Keep the typewriter fast enough to drain bursts**
   - In `src/components/chat/TypewriterMessage.tsx`, remove any per-frame cap that throttles backlog (the 4-char clamp). Let the adaptive rate govern throughput while keeping the 12–480 cps clamp.
4) **Only flip completion once the UI is aligned**
   - In `packages/chat-next-ui/src/useChatStream.ts`, keep `animated=true` / `completionTimes` unset until the typewriter drain finishes, or at least until the final text has been committed. If you need a signal, pass `onDone` from `TypewriterMessage` up to the message state.

## Implementation checklist
- [ ] Chunk token emissions in `stream.ts` so short replies still arrive in >1 event.
- [ ] Defer `done` until after the last token enqueue/flush.
- [ ] Remove backlog throttle in `TypewriterMessage` and keep safety nets (snap to target when streaming ends).
- [ ] Ensure `useChatStream` completion flipping does not race ahead of the renderer (optionally wait for typewriter `onDone`).

## Validation
- Simulate SSE with a single 500–1k char token + `done` same tick; confirm the typewriter animates while `streaming=true`, not after.
- Simulate normal multi-chunk streaming; ensure pacing feels continuous and cursor stops at completion.
- Verify safety net: when streaming ends and queue is empty, display matches final text with no trailing typing.

## Notes
- Remove `DEBUG_TYPEWRITER` logging once the pacing is verified.
