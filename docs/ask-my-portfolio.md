@docs Ask My Portfolio — Implementation Guide

This page describes the current “Ask my portfolio” experience as it exists in code today. Use it when you need to understand how the chat surface is wired or where to extend it.

## 1. Experience Map
- `src/app/layout.tsx` renders the global frame: animated background, `Header`, and a `LoadingOverlay`-wrapped `<main>` so every route shares the same chrome.
- `src/app/page.tsx` keeps the landing page focused: `HeroTitle` (typewritten headline) followed by `ChatDock`. No hero grid or extra panels compete with the chat.
- The chat module (`src/components/chat/*`) is self-contained so other routes can import it later if we ever want the “ask” surface elsewhere.

## 2. Header + Global Typewriter
- The header (`src/components/Header.tsx`) is a client component that relies on `HoverContext` for copy changes and on `framer-motion` for the animated pill buttons. Each nav item expands to text on hover, while the inactive buttons fade if another tab is focused.
- `HeaderTypewriter` (`src/components/HeaderTypewriter.tsx`) derives a base label from the current route via `resolveHeaderBaseText()` and only overrides it while a nav pill is hovered. It shares the same glyph cursor as the main hero for consistency.
- `hoverMessages` still provide the playful second line (“about me”, “projects”, etc.), but now the header is the surface that changes copy. When the pointer leaves a nav pill we clear both the shared hover state and the per-header hover text so the typewriter returns to the route-based baseline.

## 3. Hero Title & Hover Interop
- `HeroTitle` (`src/components/HeroTitle.tsx`) consumes both `useChat()` and `useHover()`:
  - `TypeWriter` receives `baseText="hi, i'm james."` plus whatever hover text is currently set, so the hero still gains a second line when the header is hovered.
  - Once the visitor sends their first message (`chatStarted`), `hideCursorOnComplete` removes the blinking cursor so the focus stays in the chat.
- `TypeWriter` (`src/components/TypeWriter.tsx`) handles backspacing + retargeting logic. It remembers prior hover text so that rapidly moving between icons does not jitter; it fully deletes the previous hover line before typing the new one.

## 4. Chat UI Stack
- `ChatDock` (`src/components/chat/ChatDock.tsx`) is purely declarative: thread, composer, and an inline error line. It also wraps the stack in `ChatQueryProvider` so hooks can share one React Query client.
- `ChatThread` identifies the most recent assistant message so the UI knows which bubble should continue typing. A “Thinking…” spinner appears whenever `isBusy` is true.
- `ChatMessageBubble` renders a message as a sequence of `parts`. User text is shown verbatim. Assistant text is special-cased:
  - For the most recent assistant message the final text block flows through `TypewriterMessage`, which animates toward the latest string and can optionally show a cursor for Markdown blocks.
  - Once a message is “settled” it falls back to `ChatMarkdown`, so re-renders skip the animation.
- Attachments (`part.kind === 'attachment'`) are delegated to helper components so Project cards, README panels, docs, nav links, and social lists all share one renderer.
- `ChatComposer` keeps the textarea auto-resized, disables send while busy, and submits on Enter (Shift+Enter inserts a newline). `AnimatedSendButton` matches the textarea height so the pill always lines up.

## 5. Attachments & Inline Docs
- `ProjectCardList` renders chat-sized rows (`variant="chat"`) and lets visitors expand a repo inline. It pre-seeds the React Query cache with the incoming repos and fetches a README on demand via `useRepoReadme`.
- `ProjectInlineDetails` wraps `ProjectContent` in the compact Markdown variant. When the assistant asks you to “open docs/foo.md”, click handlers call `useRepoDocument.ensureDocument` and swap in the requested doc while keeping breadcrumbs inside the same attachment.
- `DocumentInlinePanel` handles standalone doc attachments sent straight from tool calls (the assistant might jump from the chat to a doc). Breadcrumbs always offer a quick way back to the README.
- `SocialLinkList` powers the “follow me” style attachment and simply renders cards with external anchors.
- `MarkdownViewer` accepts `variant="chat"` to enforce a max height (`60vh`), smaller type, and scroll overflow so inline docs never overrun the viewport.
- `createMarkdownComponents` intercepts repo-relative `docs/*` links. In the chat variant we prevent default navigation and call `onDocLinkClick`, which keeps the experience inside the inline panel; otherwise the link points to `/projects/[pid]/doc/...`.

## 6. Markdown Streaming & Cursor Logic
- `TypewriterMessage` lives in `src/components/chat/TypewriterMessage.tsx`. Rather than re-implementing Markdown, it delegates to `ChatMarkdown` with the progressively-growing text.
- `ChatMarkdown` performs a double-pass render: the first pass counts block-level nodes for a given string; the second pass knows which block is last so the blinking cursor only appears at the true end of the response even while Markdown is still rendering.
- When `showCursor` is true (only on the last assistant block) the cursor rides on the final paragraph/list/blockquote or code fence. Older bubbles never show cursors.

## 7. React Query–Backed Chat Data
- `ChatQueryProvider` instantiates a `QueryClient` with a 5‑minute `staleTime`, 30‑minute `gcTime`, and no refetch-on-focus. That keeps READMEs and docs warm for the duration of a visit.
- Hooks:
  - `useProjectListCache` fetches `/api/github/portfolio-repos`, seeds the cache when the assistant dumps cards, and exposes `ensureProjectList()` for later curated lists.
  - `useRepoReadme` and `useRepoDocument` manage `/api/github/readme/:owner/:repo` and `/api/github/document/:owner/:repo/:path` endpoints with `ensure*` and `seed*` helpers so inline panels never refetch what the assistant already sent.
  - `documentQueryKey`, `readmeQueryKey`, and `PROJECT_LIST_QUERY_KEY` live in `src/lib/query-keys.ts`. Everything runs on `@tanstack/react-query`.

## 8. Chat State & Streaming Client
- `ChatContext` (`src/context/ChatContext.tsx`) is the single source of truth for chat state. `useChat()` simply re-exports the context.
- Messages are arrays of `{ role, parts[] }`. Each `parts` entry is either `{ kind: 'text', text, itemId? }` or `{ kind: 'attachment', attachment, itemId? }`. We keep `itemId`s from OpenAI events so streaming text and attachments stay in order.
- Sending a message:
  1. Reject empty/duplicate submissions while `isBusy`.
  2. Append the user message optimistically, flip `chatStarted`, show the “thinking” banner, and `fetch('/api/chat')`.
  3. Create an empty assistant message with `animated: true` and push it into state.
- Streaming loop:
  - Response bodies are read as SSE frames split by blank lines (`\n\n`). Each payload is JSON behind a `data:` prefix.
  - Event types we handle: `item` (register OpenAI item ids), `token` (append to the matching text part), `attachment` (insert or replace a part), `error`, and `done`.
  - `ensureTextPart` guarantees there is always a text part ready for a given `itemId`. Replacements copy the part array so React sees the diff.
- After the stream ends we reset the banner to hover mode and clear `isBusy`. Errors bubble into `error` so `ChatDock` can render a red helper line.
- We keep at most the last 12 messages when flattening into `{ role, content }` before calling the API to prevent run-away context windows.

## 9. API Route, Streaming, & Rate Limiting
- `src/app/api/chat/route.ts` handles POSTs from the client:
  - It bails early if `OPENAI_API_KEY` is missing.
  - `enforceChatRateLimit` (Upstash sliding window of 10 requests/min) adds friendly headers so the client could respect `Retry-After` later.
  - The route expects `{ messages: ChatRequestMessage[] }`, builds instructions via `buildSystemPrompt()`, and uses the Responses API with `model: 'gpt-5-nano-2025-08-07'`, `stream: true`, and our `tools`.
- Streaming implementation details:
  - `response.output_item.added` events let us capture the `item.id` + `item.name` for tool calls. We forward a simplified `item` event to the browser so it can order output deterministically.
  - `response.output_text.delta` events turn into `token` SSE frames with both the delta and the originating `item_id`.
  - `response.function_call_arguments.done` triggers the server-side tool invocation via `toolRouter`. Whatever the tool returns is wrapped in `attachment` SSE frames.
  - We always send a trailing `done` frame, even if the OpenAI stream throws, so the client can stop its reader cleanly.

## 10. Prompt & Knowledge Pipeline
- `buildSystemPrompt` (`src/server/prompt/buildSystemPrompt.ts`) pulls:
  - `getAboutMarkdown()` (personal bio/voice),
  - `getRepos()` (gist-configured repo list, with star metadata),
  - cached `generated/repo-summaries.json` (two-sentence summaries + stack tags).
  It then assembles a developer-style instruction block with tone guidance, star emphasis, tool etiquette, and two inventory sections (“Repo Inventory” + “Project Summaries”).
- `generated/repo-summaries.json` and `generated/repo-embeddings.json` come from `scripts/generate-project-knowledge.ts`, which
  1. loads the gist portfolio config,
  2. fetches each README (truncating to 8K chars),
  3. runs GPT-5 nano twice (facts + summary/tags),
  4. embeds the combined summary/facts text using `text-embedding-3-small`.
- `src/server/project-knowledge.ts` consumes those files at runtime. It normalizes tags, exposes `getKnowledgeRecords()` for deterministic ordering, and powers `searchRepoKnowledge(query, limit)` by embedding incoming queries and computing cosine similarity.

## 11. Tooling Layer
- `src/server/tools/index.ts` exports the array we hand to OpenAI plus `toolRouter()`:
  1. `listProjects(filters?, limit?, sort?)` delegates to `github-tools.listProjects`. Filters are normalized and may fall back to semantic search; sort supports `recent`, `alphabetical`, and `starred`. Returns `project-cards`.
  2. `searchProjects(query, limit=5)` performs semantic lookup via embeddings, applies a `STARRED_SCORE_BOOST`, and returns cards ranked by similarity.
  3. `getReadme(repo)` fetches the README + repo metadata and emits a `project-details` attachment.
  4. `getDoc(repo, path)` streams arbitrary markdown docs (e.g., `docs/ARCH.md`) as a `doc` attachment so the chat can render inline docs even outside the README.
- `src/server/tools/github-tools.ts` is where most logic lives: it bridges cached repo records, the embeddings helper, and the GitHub API (or private gist config) and centralizes `augmentRepoWithKnowledge` so our cards always carry summaries/tags for the UI to show.

## 12. Supporting Notes & Next Steps
- `docs/gpt5-nano-integration.md` dives deeper into the embeddings pipeline and tool semantics—skim that whenever you need to regenerate knowledge or tweak model settings.
- `docs/chat-data-caching.md` explains how the React Query cache complements the existing `unstable_cache` helpers in `src/lib/github-server.ts`.
- Future enhancements to keep in mind:
  - Pre-hydrating the chat cache on SSR routes would let us show the first set of project cards without waiting for React Query, but it adds bundle weight.
  - The assistant already streams `itemId`s; exposing that metadata to the UI (e.g., tool badges per attachment) would make debugging even easier.

This doc should now match the live code. If you adjust the chat flow, streaming protocol, or tool contracts, update the relevant section here so designers/devs stay aligned.
