@docs GPT-5 Nano Integration Overview

## High-Level Flow
- `scripts/generate-project-knowledge.ts` runs offline, using `gpt-5-nano-2025-08-07` twice per repo:
  - **RepoFacts pass:** extracts languages, frameworks, platforms, domains, tooling, notable features, and aliases straight from the README (truncated to 8K chars). Output is coerced into arrays for consistent downstream use.
  - **RepoSummary pass:** consumes the facts + README to produce a two-sentence summary and 4‑12 tags that explicitly list the stack. These summaries/tags become `generated/repo-summaries.json`.
- The script also builds embeddings with `text-embedding-3-small` using the summary, tags, and formatted facts. The vectors land in `generated/repo-embeddings.json`. Both files sit in `generated/` and are checked in / deployed alongside the app.

## Runtime Prompt Construction
- `src/server/prompt/buildSystemPrompt.ts` pulls `getAboutMarkdown()` + `getRepos()` (which itself reads the gist config plus GitHub data) and enriches each repo with the cached summary/tags.
- The system prompt includes:
  - Tone + conversational guidelines.
  - Tool usage expectations (“don’t call tools unless needed”, “explain before calling”).
  - Explicit reminders that starred repos are personal highlights.
  - A full “Repo Inventory” list and a “Project Summaries” section so GPT-5 starts each turn with fresh context.

## Chat Endpoint
- `src/app/api/chat/route.ts` instantiates `OpenAI` with `gpt-5-nano-2025-08-07` for streaming responses. Inputs include:
  - Developer message that enforces step-by-step reasoning + conversational tone.
  - The composed system prompt.
  - User + assistant history.
  - Tool definitions from `src/server/tools/index.ts`.
- The handler enforces a rate limit (`src/lib/rate-limit.ts`), then streams the response, routing tool calls via `toolRouter`.

## Tooling Layer
- `src/server/tools/index.ts` exposes four tools:
  - `listProjects`
  - `searchProjects`
  - `getReadme`
  - `getDoc`
  Each call is JSON-parsed and forwarded to helper functions in `src/server/tools/github-tools.ts`.

### listProjects
- Signature accepts `filters` (language/topic), `limit`, and `sort`.
- Behavior:
  1. **Filtered calls:** normalize each filter value (lowercase, trimmed) and build a semantic query string (`language react topic ai`). Forward to `searchProjects` with a target limit (defaults to 10 when unspecified). Sorting still applies after results return.
  2. **Unfiltered calls:** fall back to deterministic knowledge records (`getKnowledgeRecords()`), preserving the gist order unless `sort` is specified. The returned repos are augmented with summaries/tags before slicing to the limit (if provided).

### searchProjects
- Accepts a free-form `query` + limit (default 5).
- Internals:
  - Calls `searchRepoKnowledge(query, limit + STARRED_PRIORITY_BUFFER)` to pull cosine-similarity matches from the precomputed embeddings.
  - Hydrates each repo via `getRepos()` + `augmentRepoWithKnowledge()`.
  - Applies `STARRED_SCORE_BOOST` (currently `1.1`) by multiplying the similarity score whenever `repo.isStarred` is true, then re-sorts by this weighted score and trims back to the requested limit.
  - Returns project cards ready for the chat UI.

### searchRepoKnowledge
- Defined in `src/server/project-knowledge.ts`.
- Tokenizes and lowercases the query, then calls `text-embedding-3-small` to embed it.
- Computes cosine similarity against every stored embedding, sorts descending, and returns the top `limit` (after filtering out repos lacking summaries). The vector math itself is deterministic; star bias happens later in `searchProjects`.

## Data Sources
- `getRepos()` (in `src/lib/github-server.ts`) merges GitHub API data with the gist config, respecting `isStarred`, private repo metadata, icons, etc.
- `.env.local` / `.env` supply `OPENAI_API_KEY`, `GITHUB_TOKEN`, `PORTFOLIO_GIST_ID`, and optional `PROJECT_KNOWLEDGE_CONCURRENCY`.

## Why Tools Instead of Prompt-Only
- Even though the system prompt includes the repo inventory + summaries, we always call tools to:
  - Enforce filters (`language`, `topic`, `sort`, `limit`) server-side.
  - Guarantee fresh metadata (timestamps, icons, private repo descriptions).
  - Return structured `project-cards` attachments that the chat UI renders consistently.
- Without the tools, the LLM would have to “guess” card layouts and might drift as the conversation grows.

## Key Constants
- `STARRED_PRIORITY_BUFFER` (src/server/tools/github-tools.ts): number of extra semantic matches fetched before trimming so borderline starred repos remain candidates.
- `STARRED_SCORE_BOOST`: multiplier applied to an embedding score when `repo.isStarred` to bias rankings without touching the embeddings themselves.
- `MAX_README_CHARS` (scripts/generate-project-knowledge.ts): 8,000 char cap to keep summarization prompts efficient.

## Typical Request Lifecycle
1. User asks for “React projects”.
2. GPT-5 (steered by the system prompt) decides to call `listProjects` with `filters=[{ field: 'language', value: 'React' }]` and `limit=3`.
3. `listProjects` builds the semantic query, delegates to `searchProjects`, which in turn calls `searchRepoKnowledge`.
4. `searchRepoKnowledge` embeds the query and returns top matches.
5. `searchProjects` hydrates, star-boosts, sorts, and trims to 3 repos, then the tool router sends back a `project-cards` attachment.
6. GPT-5 sees the tool result, references the returned cards (already enriched with summaries/tags), and completes its response.

This setup keeps GPT-5-nano conversational and grounded, while all the heavy lifting—summaries, embeddings, filtering, star biasing—runs on our side with deterministic control.
