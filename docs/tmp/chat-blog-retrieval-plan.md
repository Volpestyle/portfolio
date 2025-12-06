# Plan: Let Chat Retrieve Blog Posts as Cards

## Goal
Let the chat pipeline search published blog posts and surface them as inline blog cards (title, summary, tags, recency, read time), aligned with the assistant’s answer when the user asks about writing, opinions, walkthroughs, or deep-dives.

## Approach (high level)
- Treat blog posts as a first-class corpus in preprocessing (structured summaries + embeddings + recency signals).
- Extend contracts/spec to add a `blog` retrieval source plus `uiHints.blogPosts`/`showBlogPosts` and a `blog_post` attachment payload.
- Wire orchestrator retrieval + prompts + UI payload derivation to fetch/filter blog posts and stream blog cards.
- Hydrate the frontend from generated artifacts (or existing blog store in dev) and render inline blog cards using the existing BlogCard visuals.

## Tasks
1) **Data & Preprocessing**
   - Define a `BlogPostDoc` shape (id/slug, title, summary, tags, publishedAt/updatedAt, readTimeLabel, heroImageKey?, contentSnippet?).
   - Add a blog ingest step in chat-preprocess to pull published posts (via blog store/Dynamo+S3 or a local mock in tests), normalize, and skip drafts unless a dev flag is set.
   - Generate `generated/blog-posts.json` + `generated/blog-posts-embeddings.json` with recency metadata and per-run metrics.
   - Optionally link posts to projects/experiences via tags or explicit mapping to boost retrieval relevance.

2) **Contracts & Spec**
   - Update `docs/features/chat/chat-spec.md` and `@portfolio/chat-contract` to add `RetrievalSource = 'projects' | 'resume' | 'profile' | 'blog'`.
   - Extend `AnswerUiHints` with `blogPosts?: string[]` and `UiPayload` with `showBlogPosts: string[]`; clamp lengths like other cards.
   - Add a `blog_post` attachment type carrying blog metadata + truncated content; document SSE expectations and filtering rules (only retrieved IDs allowed).
   - Note prod-only inclusion of published posts and grounding constraints (no hallucinated summaries).

3) **Retrieval & Orchestrator**
   - Add a blog searcher in `@portfolio/chat-data` (MiniSearch BM25 on title/summary/tags/body snippet + embedding re-rank + recency boost).
   - Extend `createRetrieval` drivers, caches, and `RetrievalResult` to include blogs; trim/score like projects.
   - Teach pipeline plan execution to handle `blog` queries and add retrieved blog snippets to the Answer prompt context.
   - Emit blog attachments from `UiPayload.showBlogPosts`, normalizing IDs and dropping non-retrieved hints.

4) **API & Data Providers**
   - Create a `BlogRepository` reading from generated artifacts (with a dev/test adapter that proxies the existing blog store/mock-store).
   - Expose a lightweight `/api/chat/blog-posts` (or extend existing hydration endpoints) to hydrate the chat UI cache by slug/id.
   - Ensure published-only filtering in prod and cache headers consistent with projects/resume.

5) **UI (chat-next-ui + app)**
   - Extend `UiPayload` handling in `ChatProvider`/`useChat` to track `visibleBlogPostIds` and cache `BlogPostSummary`.
   - Update `ChatActionSurface` (and any inline portals) to render blog cards, reusing `BlogCard` styles with a condensed layout suitable for chat.
   - Add loading/error placeholders for streamed blog attachments; support deep-link buttons (`/blog/[slug]`).

6) **Prompting & Behavior**
   - Update planner prompt/spec to mention the `blog` source (use for “writeups”, “post”, “article”, “opinions”, “process stories”, etc.).
   - Update answer prompt/spec to describe when to emit `uiHints.blogPosts` (only when the text answer references the post) and to avoid over-showing cards (e.g., cap at 2–3).
   - Add grounding reminders not to summarize un-retrieved content and to admit when no relevant posts exist.

7) **Testing, Evals, Observability**
   - Add blog fixtures to `packages/test-support` and retrieval unit tests covering BM25+embedding ordering and recency boosts.
   - Extend streaming/API tests to assert `ui` frames include `showBlogPosts` and `attachment` frames include `blog_post`.
   - Add UI tests/snapshots for blog cards in chat and ensure caches hydrate from the new endpoint.
   - Add eval cases for blog-focused queries (“Do you have a post on X?”, “What did you learn from writing about Y?”) with card alignment checks; log retrieval metrics for the blog source.
