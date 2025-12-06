# Blog CMS

This document reflects the blog system that ships in the repo today: a Next.js App Router CMS with Auth.js, DynamoDB, S3-backed revisions, and AWS Scheduler-powered publishing.

## Architecture

- **Auth**: Auth.js (Google + GitHub providers) with JWT sessions and an email allowlist (`ADMIN_EMAILS`). `/admin` is gated in `middleware.ts`, and every server action re-checks the session; test fixtures can bypass with `E2E_ADMIN_BYPASS_SECRET`.
- **DynamoDB (`POSTS_TABLE`)** stores post metadata and optimistic concurrency versioning:
  - `slug` (PK), `title`, `summary`, `status` (`draft` | `scheduled` | `published` | `archived`), `publishedAt`, `updatedAt`, `tags[]`, `heroImageKey`, `currentRevisionKey`, `version`, `readTimeMinutes`, `scheduledFor`, `activeScheduleArn`, `activeScheduleName`.
  - GSI `POSTS_STATUS_INDEX` (default `byStatusPublishedAt`) supports published listings.
- **Content revisions in S3 (`CONTENT_BUCKET`)**: markdown saved to `posts/<slug>/rev-<timestamp>.md` with `text/markdown` content type. The latest key is cached on the post record; older revisions are pruned after ~5 copies or seven days. Read time is estimated at ~200 wpm and stored as `readTimeMinutes`/`readTimeLabel`.
- **Media uploads in S3 (`MEDIA_BUCKET`)**: presigned PUT URLs place files at `images/<YYYY>/<MM>/<uuid>.<ext>`. The client validates JPG/PNG/GIF/WebP ≤ 5 MB before uploading.

## Admin & API surface

- **Routes** (all require an authenticated admin session unless fixtures are enabled):
  - `GET /api/admin/posts` — list posts (search + status filter).
  - `POST /api/admin/posts` — create metadata and initial draft revision.
  - `GET /api/admin/posts/[slug]` — fetch metadata + latest revision (drafts allowed).
  - `PUT /api/admin/posts/[slug]` — save draft (updates title/summary/tags/heroImageKey, writes new revision, bumps `version`).
  - `POST /api/admin/posts/[slug]/publish` — publish now (optional `publishedAt` override), clears any schedule, revalidates blog tags/paths.
  - `POST /api/admin/posts/[slug]/schedule` — schedule via AWS Scheduler; stores ARN/name and `scheduledFor`.
  - `POST /api/admin/posts/[slug]/unschedule` — cancel schedule and return to `draft`.
  - `POST /api/admin/posts/[slug]/archive` — archive and clear schedule.
  - `POST /api/admin/posts/[slug]/delete` — delete DynamoDB item and all S3 revisions.
  - `POST /api/admin/media/presigned-url` — presigned upload URL for media (requires `contentType` + `ext`).
- **Optimistic concurrency**: mutation endpoints expect the current `version`; DynamoDB conditions reject stale writes. Slugs cannot be changed after creation.
- **Public readers**:
  - `listPublishedPosts` uses the status GSI with pagination for `/blog`.
  - `getPostWithContent` loads the latest revision from S3; draft access is allowed when Next.js draft mode is enabled.

## Publishing, scheduling, and revalidation

- Publishing sets `status=published`, optionally honors a provided `publishedAt`, removes any scheduler state, and revalidates:
  - Tags: `post:<slug>`, `posts`
  - Paths: `/blog/<slug>`, `/blog`, `/sitemap.xml`
  - CloudFront invalidation runs when `CLOUDFRONT_DISTRIBUTION_ID` is set.
- Scheduling uses AWS Scheduler + the `BLOG_PUBLISH_FUNCTION_ARN` Lambda:
  - `schedulePost` provisions/updates a scheduler entry with `SCHEDULER_ROLE_ARN`.
  - The blog publisher Lambda re-reads the item, flips it to `published` if it is still `scheduled`, and then calls `/api/revalidate` with the shared `REVALIDATE_SECRET`.
  - Unscheduling or archiving deletes the scheduler entry and resets the state.

## Draft preview

- `GET /api/draft?slug=<slug>&redirect=/blog/<slug>` enables Next.js draft mode for the current admin and optionally redirects to the blog page; `DELETE /api/draft` disables it.
- The blog page checks `draftMode()` and will render drafts when enabled.

## Revalidation endpoint

- `POST /api/revalidate` requires header `x-revalidate-secret` that matches `REVALIDATE_SECRET` (resolved from Secrets Manager). Payload accepts `{ paths: string[]; tags: string[] }`.
- `revalidateContent` always normalizes paths, revalidates tags/paths, and performs CloudFront invalidations when configured.

## Fixtures and safety valves

- `BLOG_TEST_FIXTURES=true` (non-prod only) swaps DynamoDB/S3 for the in-repo mock store from `@portfolio/test-support/blog/mock-store`, unless `SKIP_TEST_FIXTURES`/`E2E_USE_REAL_APIS` opt out.
- `E2E_ADMIN_BYPASS_SECRET` + fixture headers allow E2E tests to call admin APIs without OAuth.

## Environment variables

- **Auth**: `ADMIN_EMAILS`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GH_CLIENT_ID`, `GH_CLIENT_SECRET`, `NEXTAUTH_URL` (defaults to site URL when unset).
- **Blog data**: `POSTS_TABLE`, `POSTS_STATUS_INDEX` (defaults to `byStatusPublishedAt`), `CONTENT_BUCKET`, `MEDIA_BUCKET`, `AWS_REGION`.
- **Scheduling**: `BLOG_PUBLISH_FUNCTION_ARN`, `SCHEDULER_ROLE_ARN`.
- **Revalidation**: `REVALIDATE_SECRET` (Secrets Manager), `CLOUDFRONT_DISTRIBUTION_ID` for cache invalidations.
