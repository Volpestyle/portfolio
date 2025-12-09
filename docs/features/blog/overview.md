# Blog Feature Overview

The portfolio includes a full-featured blog system with admin controls, scheduled publishing, and AWS backend.

## Features

- **Rich Content** - Markdown with code highlighting
- **Admin Dashboard** - Create, edit, schedule, archive posts
- **Scheduled Publishing** - Posts publish at specified times
- **Media Management** - Image uploads with presigned URLs
- **ISR Caching** - Fast page loads with incremental regeneration

## Architecture

![Blog Architecture](../../assets/diagrams/blog-architecture.png)

## Data Model

### Post Schema

| Field | Type | Description |
|-------|------|-------------|
| `slug` | String (PK) | URL-safe identifier |
| `title` | String | Post title |
| `content` | String | Markdown content (S3 ref) |
| `excerpt` | String | Short summary |
| `status` | Enum | draft, published, archived |
| `publishedAt` | ISO String | Publication timestamp |
| `scheduledFor` | ISO String | Scheduled publish time |
| `tags` | String[] | Post categories |
| `coverImage` | String | Media bucket URL |

### Status Flow

```
draft ──┬──▶ published
        │
        └──▶ scheduled ──▶ published
                              │
                              ▼
                          archived
```

## API Endpoints

### Public

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/posts` | GET | List published posts |
| `/api/posts/[slug]` | GET | Get single post |

### Admin

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/blog/posts` | GET | List all posts |
| `/api/admin/blog/posts` | POST | Create post |
| `/api/admin/blog/posts/[slug]` | PUT | Update post |
| `/api/admin/blog/posts/[slug]` | DELETE | Delete post |
| `/api/admin/blog/publish/[slug]` | POST | Publish draft |
| `/api/admin/blog/schedule/[slug]` | POST | Schedule post |
| `/api/admin/blog/archive/[slug]` | POST | Archive post |
| `/api/admin/media/upload` | POST | Get presigned URL |

## Scheduled Publishing

### How It Works

1. User schedules post via admin dashboard
2. EventBridge schedule created via API
3. At scheduled time, Lambda function triggers
4. Post status updated to `published`
5. ISR cache revalidated

### EventBridge Schedule

```json
{
  "ScheduleExpression": "at(2024-01-15T09:00:00)",
  "Target": {
    "Arn": "arn:aws:lambda:...blog-publish-function"
  }
}
```

## Media Management

### Upload Flow

1. Client requests presigned URL
2. Server generates URL with content type
3. Client uploads directly to S3
4. Media URL used in post content

### Presigned URL Request

```json
{
  "filename": "cover.jpg",
  "contentType": "image/jpeg"
}
```

### Response

```json
{
  "uploadUrl": "https://bucket.s3.amazonaws.com/...",
  "publicUrl": "https://cdn.example.com/media/..."
}
```

## Admin Access

### Authentication

Admin routes require:
1. NextAuth.js session
2. Email in `ADMIN_EMAILS` list

### Configuration

```bash
# Comma-separated admin emails
ADMIN_EMAILS=admin@example.com,author@example.com
```

## Cache Invalidation

### On Publish

1. DynamoDB updated
2. ISR tag `posts` revalidated
3. Individual post tag revalidated
4. CloudFront paths invalidated

### Revalidation API

```bash
POST /api/revalidate
{
  "tags": ["posts", "post:my-slug"],
  "paths": ["/blog", "/blog/my-slug"]
}
```

## Development

### Fixture Mode

Use mock data during development:

```bash
BLOG_TEST_FIXTURES=true pnpm dev
```

### Real Data

Connect to AWS resources:

```bash
# Ensure AWS credentials configured
BLOG_TEST_FIXTURES= pnpm dev
```

## Related Documentation

- [Infrastructure](../../architecture/infrastructure.md) - DynamoDB and S3 setup
- [Authentication](../authentication.md) - Admin access control
- [Deployment](../../deployment/overview.md) - Production setup
