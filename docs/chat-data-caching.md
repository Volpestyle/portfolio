## Chat vs. SSR Data Caching

- **SSR routes (`/projects`, `/projects/[pid]`, etc.)** pull portfolio data on the server via helpers in `src/lib/github-server.ts`, which use Next.js `unstable_cache` (s-maxage 1h) for repo lists, readmes, and docs. That cache lives only on the server edge/runtime.
- **Chat experience (`src/components/chat/*`)** runs entirely on the client, so we maintain a separate React Query cache via `ChatQueryProvider`. Hooks such as `useProjectListCache`, `useRepoReadme`, `useRepoDocument`, and `useAssetPrefetch` keep project lists, readmes, docs, and images warm inside the browser session.
- Because the SSR layer never hydrates its results into the client QueryClient (and the chat UI never calls the server helpers directly), the two caches are independent: loading a project page won’t prime the chat cache, and chat prefetches don’t affect SSR responses.
- If we ever want a shared cache, we’d need to hydrate React Query with server-fetched data (e.g., using `dehydrate` on project routes) or move both experiences to the same data-fetching strategy. Until then, each surface manages its own cache suited to its runtime constraints.***
