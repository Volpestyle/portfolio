# Plan: Fully Abstract Chat Implementation Into Packages (UI Stays in Next.js)

## Goal
- Next.js app only owns presentation (components, styling) and lightweight wiring (rate limit + secret retrieval).
- All chat behavior (pipeline, config parsing, validation, moderation, runtime cost/budgeting, data bootstrap, SSE streaming, logging) lives in `@portfolio/*` packages.
- API route becomes a thin adapter: injects app-specific concerns into a package-provided handler.

## Target End State
- `src/app/api/chat/route.ts` (or equivalent) does:
  - run rate-limit (app concern)
  - obtain OpenAI client (app concern for secret loading)
  - call a package-provided handler that accepts `{ messages, ownerId, conversationId, responseAnchorId, reasoningEnabled }`, plus hooks for rate-limit headers, fixtures, moderation, runtime cost.
- `src/server/chat/**` removed (replaced by package exports).
- Data/config resolution lives in packages and consumes generated artifacts (`generated/*.json`) via well-defined inputs.

## Current App-Owned Pieces To Move
- Bootstrap/config: `src/server/chat/bootstrap.ts`, `src/server/chat/config.ts`.
- Request validation + reasoning toggle: `src/server/chat/requestValidation.ts`.
- Moderation: `src/server/chat/moderation.ts`.
- Runtime cost/budget: `src/server/chat/runtimeCost.ts`.
- SSE plumbing/error responses: logic currently inside `api/chat/route.ts`.
- Misc: fixture routing (`shouldServeFixturesForRequest`) stays app-side but should plug into a package hook.

## Proposed Package Surfaces
1) **Config/bootstrap helper (new or extend `@portfolio/chat-next-api`)**
   - `loadChatConfig`, `resolveChatRuntimeOptions`, `resolveResumeFilename` already exist; move to package export.
   - `createPortfolioChatServer` already in `@portfolio/chat-next-api`; expose a convenience `createPortfolioChatRuntime({ generatedFiles, getEmbeddingClient })` that returns `{ chatApi, providers, runtimeOptions, ownerId }`.

2) **HTTP/request layer (new helper)**
   - Export `createChatHttpHandler` (or Next-specific `createNextChatHandler`) from `@portfolio/chat-next-api`:
     - Input: `{ chatApi, chatLogger, chatOwnerId, runtimeOptions, getClient, validateRequest?, resolveReasoningEnabled?, inputModeration?, outputModeration?, runtimeCost?, fixtureResponder?, rateLimitResult? }`.
     - Returns: `{ handleRequest(req): Response }` or a function tailored for Next route.
   - Include the SSE streaming, error event building, and response headers inside this helper.

3) **Request validation module**
   - Move `validateChatPostBody` and `resolveReasoningEnabled` into a package (e.g., `@portfolio/chat-next-api/validation`), parameterized by expected ownerId and optional features.

4) **Moderation module**
   - Package export `moderateInputMessages(client, messages, options)` and optionally `moderateOutput(text, options)`, wired into the handler.

5) **Runtime cost plugin**
   - Move `runtimeCost.ts` into a package (e.g., `@portfolio/chat-next-api/runtime-cost` or a new `@portfolio/chat-cost`).
   - Expose interfaces `{ getClients(ownerId) => clients|null, shouldThrottle(clients, logger), recordTurn(clients, costUsd, logger) }`.
   - Handler accepts optional `runtimeCost` hooks and only calls them when provided.

6) **Logging/context**
   - Keep `createChatServerLogger`, `runWithChatLogContext`, `logChatDebug` exported from package; ensure the new handler uses them internally so the app doesn’t need to wire log contexts.

7) **Fixtures hook**
   - Handler should accept an optional `fixtureResponse` factory that returns a Response; app decides when to invoke (via header/env check).

## Migration Steps
1) **Design handler API**
   - Draft TypeScript signature for `createNextChatHandler` (inputs above) inside `@portfolio/chat-next-api`.
   - Ensure it is framework-agnostic enough to reuse in other runtimes (keep core logic pure; thin Next adapter for `NextRequest` → `{ body, headers, ip }`).

2) **Move validation + moderation**
   - Relocate `requestValidation.ts` and `moderation.ts` logic into package exports.
   - Update `api/chat/route.ts` to import from package; confirm types stay in `@portfolio/chat-contract`.

3) **Move runtime cost**
   - Lift `runtimeCost.ts` into a package module; parameterize table/topic names via env or passed-in options.
   - Wire into handler as optional plugin so non-AWS deployments can omit.

4) **Package config/bootstrap**
   - Export `loadChatConfig`, `resolveChatRuntimeOptions`, and `resolveResumeFilename` from `@portfolio/chat-next-api` (or a small `@portfolio/chat-config`).
   - Keep generated-data loading in one place: provide a helper that accepts the generated JSON artifacts and returns `chatApi`, `providers`, `chatOwnerId`, and `chatRuntimeOptions`.

5) **Refactor SSE handling**
   - Move `buildErrorSseResponse` + SSE streaming glue from `api/chat/route.ts` into the new handler.
   - Ensure moderation buffering and budget errors remain intact inside the package implementation.

6) **Thin Next route**
   - After the above, `src/app/api/chat/route.ts` should:
     - run rate limit to get `{ success, headers, retryAfterMs }`
     - short-circuit if rate-limited
     - call `chatHandler.handle({ request, rateLimitHeaders, fixtureResponder, ownerIdOverride? })`
   - No other chat logic should live in the app.

7) **Tests + docs**
   - Add unit tests for the new handler and runtime-cost module in their packages.
   - Keep fixture/e2e tests pointed at the app route to confirm integration.
   - Update package READMEs with new APIs and usage snippets.

## Definition of Done
- No chat pipeline, moderation, validation, cost, or config logic under `src/server/chat/**`.
- API route reduced to rate-limit + secret fetching + handler invocation.
- Packages expose all chat behaviors behind stable exports; UI remains app-owned.
- Tests cover handler paths (happy path, moderation block, budget block, rate-limit pass-through).
