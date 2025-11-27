# @portfolio/chat-next-ui

React primitives for building the spec-aligned streaming chat experience inside the portfolio apps. The package exposes a `ChatProvider` that owns chat state, networking, streaming, UI payload handling, and a `useChat` hook that your UI components can call. UI rendering lives in the Next.js app; this package only ships the state/streaming layer.

## Installation

This package ships inside the monorepo, so it is already linked through the workspace:

```bash
pnpm add @portfolio/chat-next-ui
```

React 18+ (or Next.js 13+/App Router) is required because the provider relies on hooks and browser streaming APIs.

## Quick start

Wrap your chat UI in the provider and call `useChat()` anywhere below it:

```tsx
import { ChatProvider, useChat } from '@portfolio/chat-next-ui';

function ChatComposer() {
  const { send, isBusy, error } = useChat();
  const [draft, setDraft] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await send(draft);
    setDraft('');
  }

  return (
    <form onSubmit={handleSubmit}>
      <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
      <button type="submit" disabled={isBusy}>
        Send
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

// In your app shell, wire ChatProvider around your own UI components.
export function ChatShell() {
  return (
    <ChatProvider endpoint="/api/chat">
      <MyChatThread />
      <MyChatComposer />
    </ChatProvider>
  );
}
```

The provider automatically:

- Tracks the full message history (with a configurable window for outbound requests).
- Streams the full SSE contract (`stage`, `reasoning`, `ui`, `token`, `item`, `attachment`, `ui_actions`, `done`, `error`) and applies updates as events arrive.
- Updates `uiState.surfaces` based on UiPayload (`showProjects`, `showExperiences`, optional `coreEvidenceIds`) so components can render inline cards/actionable items next to specific assistant messages.
- Maintains normalized project/resume caches hydrated from `/api/projects` and `/api/resume`.

## `ChatProvider` props

| Prop               | Type                                                | Default                  | Description                                                                                                   |
| ------------------ | --------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `endpoint`         | `string`                                            | `/api/chat`              | URL the provider `POST`s to when sending a new message.                                                       |
| `ownerId`          | `string`                                            | `process.env.NEXT_PUBLIC_CHAT_OWNER_ID \|\| 'portfolio-owner'` | Multi-tenant key forwarded to `/api/chat`; must match the server’s configured owner.                         |
| `historyLimit`     | `number`                                            | `12`                     | Max number of prior messages included in each request payload. Non-positive/invalid values fall back to `12`. |
| `fetcher`          | `(input, init) => Promise<Response>`                | `globalThis.fetch`       | Optional injection point for custom fetch implementations (tests, polyfills).                                 |
| `requestFormatter` | `(messages: ChatMessage[]) => ChatRequestMessage[]` | Default `flatten` helper | Override the request content transformation before calling the API.                                           |
| `onError`          | `(error: Error) => void`                            | `undefined`              | Notified whenever streaming or network errors occur.                                                          |

## `useChat` return value

`useChat()` exposes the shape stored in context:

```ts
type UseChat = {
  messages: ChatMessage[]; // Accumulated messages from the user + assistant.
  send: (input: string) => Promise<void>; // Enqueues a user message and starts streaming the assistant response.
  isBusy: boolean; // True while the network request/stream is active.
  chatStarted: boolean; // Indicates whether the first message was sent.
  bannerState: BannerState; // UI hint for the chat dock/header (idle, thinking, hover).
  error: string | null | undefined; // Present when the last request failed.
  uiState: ChatUiState; // Contains the per-message surfaces for inline UI portals.
  projectCache: Record<string, ProjectSummary>; // Projects keyed by slug or normalized name.
};
```

### Working with UI surfaces

`uiState.surfaces` is an array of `ChatSurfaceState` entries keyed by the assistant message that generated them. Each surface includes:

- `anchorId`: Item/message id used to place inline UI via portals.
- `visibleProjectIds`: Ordered, deduplicated identifiers from UiPayload.showProjects.
- `visibleExperienceIds`: Ordered, deduplicated identifiers from UiPayload.showExperiences.
- `coreEvidenceIds`: Ordered evidence ids from UiPayload.coreEvidenceIds (for dev/trace alignment).
- `focusedProjectId`: Reserved for future use (currently null).
- `highlightedSkills`: Reserved for future use.
- `lastActionAt`: ISO timestamp recording when the latest UI instruction was applied.

Components such as `ChatActionSurface` use that metadata to decide which cards to display beside the assistant response. You can read from `uiState` with `useChat()` to build your own visualization.

### Streaming protocol expectations

The provider expects the chat endpoint to stream newline-separated server-sent events. Supported payloads (see the spec for shapes):

- `stage` – pipeline progress (`planner_start`, etc.).
- `reasoning` – partial `ReasoningTrace` updates.
- `ui` – UiPayload `{ showProjects, showExperiences, coreEvidenceIds?, bannerText? }` for the referenced assistant turn.
- `token` – answer token chunks (the Answer stage streams `AnswerPayload.message`).
- `item` – non-token answer parts, ordered by `itemId`.
- `attachment` – host-defined payloads (projects/resume entries).
- `ui_actions` – host-defined UI actions.
- `done` – stream completion; `error` – structured error after streaming begins.

Anything else is ignored with a console warning, so backend changes can evolve incrementally.

## Testing tips

- Provide a deterministic `fetcher` when unit-testing UI; pass a mocked `ReadableStream` that emits the same SSE frames the production API would send.
- Override `requestFormatter` to simulate different prompt structures without altering server code.
- Assert `projectCache`/`experienceCache` contents to ensure API hydration works before UI surfaces rely on them.

## Additional resources

- Chat specification and contracts: `docs/features/chat/chat-spec.md`
- Runtime configuration notes: `docs/features/chat/config-notes.md`
- Logging and visibility: `docs/features/chat/chat-logging.md`
