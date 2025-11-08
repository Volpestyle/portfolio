awesome — here’s your updated design doc swapping Cognito for Auth.js (aka NextAuth.js) using JWT sessions (no DB). It keeps everything else (OpenNext on AWS, DynamoDB/S3, ISR + on-demand revalidation) exactly as before.

⸻

CMS for jcvolpe.me/admin — Design (Auth.js edition)

0. TL;DR
   • Auth: Auth.js (NextAuth) with one OAuth provider (Google/GitHub), JWT session (no DB), and an email allowlist to gate /admin. ￼
   • Content: Post metadata in DynamoDB, post body (MD/MDX) + images in S3.
   • Publishing: No redeploys. Mutations call revalidateTag/revalidatePath and trigger CloudFront invalidation (needed with OpenNext for on-demand). ￼
   • Preview: Draft Mode for live draft preview without publishing. ￼

⸻

1. Goals
   • Minimal, secure admin at /admin with a clean, keyboard-friendly UI.
   • Content changes go live without application redeploys.
   • Keep AWS-native, cheap, and fast.

Non-goals: multi-tenant auth, complex editorial workflows (review/roles).

⸻

2. High-level architecture

[ Browser /admin ] --(OAuth login)--> [ Auth.js (NextAuth) JWT cookie ]
| |
v v
[ Next.js App Router ] -- Server Actions --> [ DynamoDB (posts meta) ]
| |
|------------------- S3 (MD/MDX + media) -|
|
+--> /blog/\* pages (ISR) -- CloudFront CDN
^ (on-demand revalidate + CDN invalidation)

    •	Auth.js: OAuth provider + JWT session cookie (stateless). DB is optional; we skip it.  ￼
    •	OpenNext: ISR/fetch cache in S3, tag cache in DynamoDB by default. On on-demand revalidation you must also invalidate CloudFront.  ￼

⸻

3. Auth design (what replaces Cognito)

Strategy:
• Use Auth.js (NextAuth) with one OAuth provider (Google or GitHub).
• Session: "jwt" (default) → encrypted JWT in an httpOnly cookie; no DB.
• Allow only specific emails (e.g., your @jcvolpe.me) via a simple allowlist in callbacks/middleware. ￼

Notes
• If you ever add email magic links, Auth.js requires a database to store verification tokens. Keep OAuth-only for “no DB”. ￼
• getToken() in middleware lets you enforce access on /admin/\*. ￼

Minimal files (v5-style):
• auth.ts — initialize NextAuth and export helpers (JWT strategy). ￼
• app/api/auth/[...nextauth]/route.ts — re-export GET/POST handlers from auth.ts. ￼
• middleware.ts — gate /admin/\* using getToken() and an email allowlist. ￼

⸻

4. Data model (unchanged)

DynamoDB Posts
• PK: slug (string)
• title, summary, status (draft|scheduled|published|archived), publishedAt, updatedAt, tags[], heroImageKey, currentRevKey, version (optimistic concurrency)
• GSI: byStatusPublishedAt (PK=status, SK=publishedAt desc) for listing; optional byTagPublishedAt.

S3
• contentBucket: posts/<slug>/rev-<ts>.md[x] (each save → new revision)
• mediaBucket: images/<yyyy>/<mm>/<uuid>.<ext> (uploaded via presigned URLs)

⸻

5. Rendering, caching & going live
   • Pages fetch meta from DynamoDB + body from S3.
   • After create/update/publish: call revalidateTag('post:'+slug) and a list tag like 'posts', or revalidatePath('/blog/[slug]') & /blog. ￼
   • Because you’re on OpenNext, also kick a CloudFront invalidation for affected paths (/blog/[slug], /blog, /sitemap.xml, /rss.xml). OpenNext provides an Automatic CDN Invalidation hook specifically for on-demand revalidation. ￼

Draft preview: enable Draft Mode for your admin session and render latest draft without publishing. ￼

⸻

6. Admin UI (sleek + minimal)
   • Posts List: search (title/slug), filter by status, table (Title / Status / Updated / Published / Actions).
   • Editor: form (title, slug, summary, tags) + Markdown editor with preview.
   • Actions: Save draft, Preview (Draft Mode), Publish now, Schedule, Delete.
   • Media: drag-drop to get a presigned upload URL; paste S3 key into MD.

Accessibility: high contrast, visible focus, aria-live for inline status.

⸻

7. Server Actions & routes (core contract)

Use Server Actions for mutations (validate with Zod + re-check session).
• createPost(data) → creates Dynamo item + empty revision.
• saveDraft({ slug, ... , body }) → uploads rev-<ts>.md to S3, updates currentRevKey, bumps version.
• publishPost({ slug }) → set status/publishedAt, then revalidate + CloudFront invalidate. ￼
• schedulePost({ slug, publishedAt }) → mark scheduled; EventBridge rule at time T → tiny Lambda flips to published and triggers the same revalidation/invalidation.
• getPresignedUpload({ contentType, ext }) → S3 presigned PUT.
• revalidateApi({ paths?, tags? }) → protected route handler to centralize revalidation + CDN invalidation.

⸻

8. Security details
   • JWT sessions (stateless): no lookups per request → great for Serverless/Edge. Default in Auth.js unless you add an adapter. ￼
   • Gate in middleware with getToken(); verify email against an allowlist. ￼
   • Defense-in-depth: re-check session inside Server Actions; validate with Zod; use CSRF tokens for critical POST forms if exposing any unauthenticated endpoints.
   • Sign-out / Revocation: remove cookie; for hard revocation, rotate NEXTAUTH_SECRET (standard JWT trade-off). ￼

⸻

9. CDK / infra changes
   • Remove Cognito resources entirely.
   • Keep / add:
   • DynamoDB Posts table (+ GSI).
   • S3 contentBucket (versioned) and mediaBucket (CORS for your origin).
   • CloudFront distribution → make sure your server Lambda role can call cloudfront:CreateInvalidation (needed for on-demand). ￼
   • OpenNext cache env variables: S3 incremental cache and Dynamo tag cache (defaults align with this design). ￼

(Optional: wire OpenNext’s Automatic CDN Invalidation override so your revalidatePath/revalidateTag automatically call CloudFront invalidations.) ￼

⸻

10. Env vars
    • Auth: NEXTAUTH_URL, NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (or GitHub equivalents).
    • App: POSTS_TABLE, CONTENT_BUCKET, MEDIA_BUCKET, AWS_REGION, CLOUDFRONT_DISTRIBUTION_ID, REVALIDATE_SECRET.
    • OpenNext cache: CACHE_BUCKET_NAME, CACHE_BUCKET_REGION, CACHE_DYNAMO_TABLE (set by your CDK). ￼

⸻

11. Key code snippets (trimmed)

Auth.js (NextAuth) config (OAuth-only, JWT sessions, allowlist)
auth.ts

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const ALLOW = new Set((process.env.ADMIN_EMAILS ?? "").split(",").map(s => s.trim()).filter(Boolean));

export const { handlers, auth, signIn, signOut } = NextAuth({
session: { strategy: "jwt" }, // no DB
providers: [Google],
callbacks: {
async jwt({ token, profile }) {
if (profile?.email) token.email = profile.email;
return token;
},
async session({ session, token }) {
session.user = { email: token.email as string };
return session;
},
async authorized({ request, auth }) {
// (Optional) coarse auth gate for route handlers; we'll still gate in middleware
return !!auth?.user?.email && ALLOW.has(auth.user.email);
},
},
secret: process.env.NEXTAUTH_SECRET,
});

app/api/auth/[...nextauth]/route.ts

export { GET, POST } from "@/auth";

Auth.js v5 uses a central auth.ts and re-exported route handlers for App Router. ￼

Middleware: protect /admin/\*
middleware.ts

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const ALLOW = new Set((process.env.ADMIN_EMAILS ?? "").split(",").map(s => s.trim()).filter(Boolean));

export async function middleware(req: NextRequest) {
if (!req.nextUrl.pathname.startsWith("/admin")) return NextResponse.next();
const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
if (!token?.email || !ALLOW.has(String(token.email))) {
return NextResponse.redirect(new URL("/api/auth/signin", req.url));
}
return NextResponse.next();
}
export const config = { matcher: ["/admin/:path*"] };

getToken() is the documented way to read the JWT in server/middleware contexts. ￼

Draft Mode (preview unpublished)
app/api/draft/route.ts

import { draftMode } from "next/headers";
export async function GET() { (await draftMode()).enable(); return new Response("Draft on"); }

Official App Router Draft Mode pattern. ￼

Revalidation + CloudFront invalidation
app/api/revalidate/route.ts

import { revalidatePath, revalidateTag } from "next/cache";
import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";

const cf = new CloudFrontClient({ region: process.env.AWS_REGION });
const distro = process.env.CLOUDFRONT_DISTRIBUTION_ID!;

async function invalidate(paths: string[]) {
if (!paths.length) return;
await cf.send(new CreateInvalidationCommand({
DistributionId: distro,
InvalidationBatch: { CallerReference: `${Date.now()}`, Paths: { Quantity: paths.length, Items: paths } }
}));
}

export async function POST(req: Request) {
const secret = req.headers.get("x-revalidate-secret");
if (secret !== process.env.REVALIDATE_SECRET) return new Response("Unauthorized", { status: 401 });

const { paths = [], tags = [] } = await req.json();
tags.forEach(t => revalidateTag(t));
paths.forEach(p => revalidatePath(p));
await invalidate(paths); // required with OpenNext for on-demand
return Response.json({ ok: true });
}

revalidatePath/revalidateTag semantics + OpenNext’s CDN invalidation requirement for on-demand. ￼

⸻

12. Implementation order
    1.  Auth.js (OAuth-only) + middleware to gate /admin. ￼
    2.  Dynamo/S3 (CDK) and envs.
    3.  Admin Posts List (read-only), then Editor with Save draft.
    4.  Publish now: revalidate + CloudFront invalidate. ￼
    5.  Draft Mode preview flow. ￼
    6.  Scheduling via EventBridge → publish Lambda.
    7.  Presigned uploads for media.
    8.  Sitemap/RSS + invalidate on publish.

⸻

13. Why this is solid
    • Auth.js + JWT keeps auth stateless and simple for a solo admin. You can add a DB/adapter later if you need email links, roles, or account linking across providers. ￼
    • OpenNext alignment: using S3 incremental cache + Dynamo tag cache and explicit CDN invalidation is the recommended path for reliable on-demand updates. ￼

If you want, I can follow this with a paste-ready repo skeleton (folders, auth.ts, middleware, minimal /admin UI) wired to your env names.
