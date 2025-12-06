# Plan: Let Chat Surface Real Repo Code Snippets

## Goal
Let the chat surface and render real code from portfolio repos when a user asks for a snippet (e.g., SSE handler, planner prompt, client hook).

## Approach (high level)
- Define a snippet manifest (repo + path + label + optional line window) so the system knows what to fetch.
- Extend chat contracts/ui hints to include snippet IDs and emit a new attachment type that carries the fetched code.
- Reuse existing repo fetchers (`getDocumentContent`) to pull files and stream them via SSE.
- Render the snippet inline in chat with the existing Markdown/Document viewer, with a GitHub/open link fallback.

## Tasks
1) **Data/Config**
   - Add `data/chat/code-snippets.json` (or gist entry) describing snippet IDs, repo, path, label, optional line ranges.
   - (Optional) Teach preprocess to ingest snippet metadata and embed snippet text for retrieval targeting.

2) **Contract**
   - Add `uiHints.codeSnippets?: string[]` to chat contract + schema; add `UiPayload.showCodeSnippets` for streaming.
   - Define a new attachment type `{ type: 'code_snippet'; id; data: { repo; path; title; content; sha?; link? } }`.

3) **Orchestrator / API**
   - When Answer returns `uiHints.codeSnippets`, resolve snippet metadata → fetch content via `getDocumentContent(repo, path)`, trim to window (or full file if small), and emit as `attachment` SSE payloads.
   - Ensure chunking/truncation guards and cache keying (anchorId) mirror existing project/resume attachments.

4) **UI**
   - Update `ChatProvider` attachment handler to cache `code_snippet` and surface in `ChatActionSurface`.
   - Add a small renderer (can reuse `DocumentInlinePanel` with a code header + “View on GitHub” link if available).
   - Add lightweight loading/error states; keep styling consistent with existing inline doc cards.

5) **Prompting / Model**
   - Update answer prompt/spec to mention `uiHints.codeSnippets` and when to use them (“user asks for code/handler/snippet”).
   - (If embeddings added) include snippet entries in retrieval to improve selection.

6) **Testing**
   - Add a fixture snippet entry + attachment to test-support; extend chat stream parser tests to cover `code_snippet`.
   - Add UI snapshot/Playwright assertion that snippet attachments render and links work.

7) **Docs**
   - Update `docs/features/chat/chat-spec.md` (SSE events + attachments) and `packages/chat-next-ui/README.md` with the new snippet flow and fields.
