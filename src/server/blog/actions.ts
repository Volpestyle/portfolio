'use server';

import { headers } from 'next/headers';
import { auth } from '@/auth';
import { isAdminEmail } from '@/lib/auth/allowlist';
import { revalidateContent } from '@/server/revalidate';
import { hasAdminBypass } from '@/lib/test-mode';
import type { BlogPostStatus } from '@/types/blog';
import {
  createPostRecord,
  saveDraftRecord,
  publishPostRecord,
  markScheduledRecord,
  unmarkScheduledRecord,
  deletePostRecord,
  getPostRecord,
  getPostWithContent,
  generateMediaUploadUrl,
  archivePostRecord,
  listPosts,
} from '@/server/blog/store';
import {
  createPostSchema,
  saveDraftSchema,
  publishPostSchema,
  schedulePostSchema,
  deletePostSchema,
  presignedUploadSchema,
  archivePostSchema,
  unschedulePostSchema,
  type CreatePostInput,
  type DeletePostInput,
  type PresignedUploadInput,
  type PublishPostInput,
  type SaveDraftInput,
  type SchedulePostInput,
  type ArchivePostInput,
  type UnschedulePostInput,
} from '@/server/blog/validators';
import { upsertPublishSchedule, deletePublishSchedule } from '@/server/blog/scheduler';

async function requireAdmin() {
  const requestHeaders = await headers();
  if (hasAdminBypass(requestHeaders)) {
    const email = process.env.E2E_ADMIN_BYPASS_EMAIL || 'playwright-admin@example.com';
    return {
      user: { email },
    };
  }

  const session = await auth();
  const email = session?.user?.email;
  if (!email || !isAdminEmail(email)) {
    throw new Error('Unauthorized');
  }
  return session;
}

type PostRevalidationOptions = {
  includeSitemap?: boolean;
};

async function revalidatePostViews(slug: string, options: PostRevalidationOptions = {}) {
  const paths = new Set<string>([`/blog/${slug}`, '/blog']);
  if (options.includeSitemap) {
    paths.add('/sitemap.xml');
  }

  await revalidateContent({
    tags: [`post:${slug}`, 'posts'],
    paths: Array.from(paths),
  });
}

export async function createPost(input: CreatePostInput) {
  await requireAdmin();
  const payload = createPostSchema.parse(input);
  return createPostRecord(payload);
}

export async function saveDraft(input: SaveDraftInput) {
  await requireAdmin();
  const payload = saveDraftSchema.parse(input);
  return saveDraftRecord({
    slug: payload.slug,
    body: payload.body,
    title: payload.title,
    summary: payload.summary,
    tags: payload.tags,
    heroImageKey: payload.heroImageKey,
    extension: payload.extension,
    expectedVersion: payload.version,
  });
}

export async function publishPost(input: PublishPostInput) {
  await requireAdmin();
  const payload = publishPostSchema.parse(input);
  const record = await getPostRecord(payload.slug);
  if (!record) {
    throw new Error('Post not found');
  }

  await deletePublishSchedule(record.activeScheduleName);
  const updated = await publishPostRecord({
    slug: payload.slug,
    publishedAt: payload.publishedAt,
    expectedVersion: payload.version,
  });
  await revalidatePostViews(payload.slug, { includeSitemap: true });
  return updated;
}

export async function schedulePost(input: SchedulePostInput) {
  await requireAdmin();
  const payload = schedulePostSchema.parse(input);
  const { arn, name } = await upsertPublishSchedule(payload.slug, payload.scheduledFor);
  return markScheduledRecord({
    slug: payload.slug,
    scheduledFor: payload.scheduledFor,
    scheduleArn: arn,
    scheduleName: name,
    expectedVersion: payload.version,
  });
}

export async function deletePost(input: DeletePostInput) {
  await requireAdmin();
  const payload = deletePostSchema.parse(input);
  const record = await getPostRecord(payload.slug);
  if (record?.activeScheduleName) {
    await deletePublishSchedule(record.activeScheduleName);
  }
  await deletePostRecord(payload.slug);
  await revalidatePostViews(payload.slug, { includeSitemap: true });
}

export async function getPresignedUpload(input: PresignedUploadInput) {
  await requireAdmin();
  const payload = presignedUploadSchema.parse(input);
  return generateMediaUploadUrl(payload);
}

export async function archivePost(input: ArchivePostInput) {
  await requireAdmin();
  const payload = archivePostSchema.parse(input);
  const record = await getPostRecord(payload.slug);
  if (!record) {
    throw new Error('Post not found');
  }
  await deletePublishSchedule(record.activeScheduleName);
  const updated = await archivePostRecord({
    slug: payload.slug,
    expectedVersion: payload.version,
  });
  await revalidatePostViews(payload.slug, { includeSitemap: true });
  return updated;
}

export async function unschedulePost(input: UnschedulePostInput) {
  await requireAdmin();
  const payload = unschedulePostSchema.parse(input);
  const record = await getPostRecord(payload.slug);
  if (!record) {
    throw new Error('Post not found');
  }
  await deletePublishSchedule(record.activeScheduleName);
  return unmarkScheduledRecord({
    slug: payload.slug,
    expectedVersion: payload.version,
  });
}

export async function listAdminPosts(filters: { status?: BlogPostStatus; search?: string }) {
  await requireAdmin();
  return listPosts(filters);
}

export async function getAdminPost(slug: string) {
  await requireAdmin();
  return getPostWithContent(slug, { includeDraft: true });
}
