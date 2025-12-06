# Admin UI

Admin is live at `/admin` and already wired to the blog APIs in this repo. It uses Auth.js (Google/GitHub) with an `ADMIN_EMAILS` allowlist and is blocked by middleware plus server-side checks.

## Feature highlights

- **Posts list** (`/admin`):
  - Search by title or slug and filter by status (`draft`, `scheduled`, `published`, `archived`).
  - Table shows title, slug, tags, status (with scheduled datetime), updated/published dates, and action buttons.
  - Quick actions: edit, view live (for published), schedule, publish, unschedule, archive, delete.
- **Post editor** (`/admin/new`, `/admin/[slug]`):
  - Metadata form with auto-generated slug (locked after creation), required title/summary, optional tags and hero image key.
  - Markdown editor with toolbar, preview toggle, and media insertion.
  - Media uploader validates JPG/PNG/GIF/WebP ≤ 5 MB, fetches a presigned PUT URL, uploads to S3, and lets you insert the key into markdown.
  - Actions: save draft, publish now, schedule/unschedule, preview draft (enables Next.js draft mode), view live.
  - Post info card shows created/published dates and the optimistic concurrency `version`.
  - Keyboard shortcuts implemented: `⌘/Ctrl + S` saves draft, `⌘/Ctrl + P` previews.

## API surface (already implemented)

All endpoints require an admin session (or the test bypass header/secret when fixtures are enabled) and expect the current `version` on mutating calls:

- `GET /api/admin/posts` — list posts (`?status`, `?search` supported).
- `POST /api/admin/posts` — create a post + first draft.
- `GET /api/admin/posts/[slug]` — fetch metadata + latest revision (drafts allowed).
- `PUT /api/admin/posts/[slug]` — save draft; keeps slug locked.
- `POST /api/admin/posts/[slug]/publish` — publish now (optional `publishedAt`).
- `POST /api/admin/posts/[slug]/schedule` — schedule publish at an ISO datetime.
- `POST /api/admin/posts/[slug]/unschedule` — cancel schedule.
- `POST /api/admin/posts/[slug]/archive` — archive and clear schedule.
- `POST /api/admin/posts/[slug]/delete` — delete the post and all revisions.
- `POST /api/admin/media/presigned-url` — presigned upload URL for media.
- `GET /api/draft` / `DELETE /api/draft` — enable/disable draft mode for previews.

## Authentication and access

- Auth.js providers are configured in `src/auth.ts`; `/admin` is protected in `src/middleware.ts`.
- Server actions re-check the session and allowlist via `isAdminEmail`.
- E2E fixtures can bypass with `E2E_ADMIN_BYPASS_SECRET` when fixture runtimes are enabled.

## Operational notes

- Mutations are optimistic-concurrency guarded with `version` checks; stale updates fail.
- Publish/schedule/unschedule/archival revalidate `/blog`, `/blog/<slug>`, and `/sitemap.xml`, plus CloudFront when configured.
- Draft previews use Next.js draft mode; only admins can enable it.

## File structure (UI)

```
src/app/admin/
├── page.tsx               # Posts list page
├── [slug]/page.tsx        # Edit post page
├── new/page.tsx           # New post page
├── layout.tsx             # Admin layout
├── not-found.tsx          # 404 for unknown slugs
└── components/
    ├── PostsFilters.tsx
    ├── PostsTable.tsx
    ├── PostEditor.tsx
    ├── MarkdownEditor.tsx
    └── MediaUploader.tsx
```
