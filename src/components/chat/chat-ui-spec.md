## Response Typewriter

- The typewriter effect in the chat UI should keep up with the speed of our streamed SSE response, rather than a fixed delay like the other instances of our typewriter effect. If we recieve a huge chunk all at once from SSE, then we should still see some sort of gradual reveal typewriter effect, it just might be very fast, to better simulate how we recieve response from the server.
- Architecture
  - SSE tokens are appended to the streaming assistant message by `useChatStream` (packages/chat-next-ui/src/useChatStream.ts). Each token lands on a text `part` (per itemId) and keeps a single streaming message marked `animated: true` until done/error.
  - Rendering uses `TypewriterMessage` (src/components/chat/TypewriterMessage.tsx) whenever `animated` is true. This component:
    - Tracks the incoming target text and a backlog queue of grapheme clusters to render.
    - Measures incoming token rate per frame; smooths into a stream rate clamped between ~12–480 chars/sec. Backlog is drained over a visible window (480–1600ms) so bursts still appear as a quick but gradual reveal instead of instant paint.
    - Handles rewinds/edits: if the stream rewrites earlier text, it resets to the common prefix, rebuilds the queue, and continues animating.
    - Continues draining after SSE end until the queue is empty, then snaps to the final target as a safety net if needed.
    - Marks completion via `onDone`, which clears `animated` for that message so subsequent renders show static Markdown.
  - Debugging: `NEXT_PUBLIC_DEBUG_TYPEWRITER=1` or `?debugTypewriter=1` logs `typewriter_*` and `sse_*` events (rate, backlog, previews) to the console to tune pacing vs SSE bursts.

## Project cards

- When the chat returns project card attachments, we see the same project card that we'd see in the /projects section of the portfolio. In the chat ui, they behave as one cohesive component instead of separate routes like at /projects
- When you click into a project card (clicking title or clicking 'view details') the card should seamlessly animate into the project details card. And from project details, we can go to the project document card (the component which can display documents (usually markdown) from a given repo).

### Animation

- we want the project card borders to animate expanding/contracting in a smooth style (ease in/ease out) similar to how the top level layout component of this nextjs app animates. Additonally, the inner content of these cards should transition smoothly with fade transitions. Note\*\* this is distinctly different from how the border animates, with no fade, only animating smoothly as the size changes. But this size change of the card would distort the inner content, which is why we want to fade in/ fade out the inner content.
- If the content of the project details or project document needs to load, we should show a centered spinner during that transition. Additionally, when the spinner shows, we dont want the project card to shrink down to the size of the spinner, the project card should maintain its size as it is loading, then adapt to the loaded content.
