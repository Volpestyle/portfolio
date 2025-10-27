## Chat vs. SSR Data Caching

### Server-rendered routes
- Server pages and API routes call helpers in `src/lib/github-server.ts` (`getPortfolioRepos`, `getRepoDetails`, `getRepoReadme`, etc.).
- Each helper is wrapped in `unstable_cache` with a one-hour revalidate window and tagged for manual invalidation. This cache lives at the edge/runtime level, so every SSR route or API handler automatically reuses the same data without extra wiring.

### Client-side chat surface
- The chat UI lives entirely on the client and is wrapped by `ChatQueryProvider`, which supplies a React Query client with session-friendly defaults (5‑minute `staleTime`, 30‑minute `gcTime`, no refetch on focus).
- Hooks like `useProjectListCache`, `useRepoReadme`, `useRepoDocument`, and `useAssetPrefetch` fetch data lazily from the `/api/github/*` endpoints the first time a user needs it. Once fetched, the data stays warm in the React Query cache for the rest of the session.

### Division of responsibility
- SSR responses do not hydrate the chat cache; the chat asks for data only when required and benefits from the server cache indirectly because the API routes reuse the same `unstable_cache` helpers.
- This separation keeps the initial page load lightweight: the home route renders immediately and the chat cache fills incrementally as the user explores projects.
- Achieving full parity between SSR content and the chat would require hydrating every query on the server (using `dehydrate` per route) or converging both surfaces on shared data-fetching APIs, but the current setup favors minimum upfront work with quick client-side caching after the first interaction.
