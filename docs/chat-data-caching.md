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

## Language Data Enrichment

### Implementation

- `RepoData` includes `languagesBreakdown` (byte counts) and `languagePercentages` (sorted percentages) populated from GitHub's `repos.listLanguages` API.
- `fetchPortfolioRepos()` and `fetchRepoDetails()` in `src/lib/github-server.ts` automatically fetch language data for public repos; private repos read it from the `languages` field in the portfolio config.
- Language data respects the same `unstable_cache` strategy as other repo data (1-hour revalidate, tagged for invalidation).

### Knowledge generation

- `scripts/generate-project-knowledge.ts` stores language percentages in `generated/repo-summaries.json` alongside summaries and tags.
- Languages are **excluded from LLM-derived tags** since GitHub provides them deterministically. The AI extracts only frameworks, platforms, tooling, and domains.
- Language names are included in embedding payloads for semantic search but kept separate from tags to avoid duplication.

### UI display

- `LanguageBar` component (`src/components/LanguageBar.tsx`) renders a visual progress bar with GitHub-inspired colors, hover tooltips, and animated labels.
- `ProjectCard` displays language data between dates and tags, visible in both SSR project grids and client-side chat cards without extra configuration.
