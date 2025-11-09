'use server';

import { auth } from '@/auth';
import { isAdminEmail } from '@/lib/auth/allowlist';
import { revalidateContent } from '@/server/revalidate';
import {
  createPostRecord,
  saveDraftRecord,
  publishPostRecord,
  markScheduledRecord,
  deletePostRecord,
  getPostRecord,
  generateMediaUploadUrl,
} from '@/server/blog/store';
import {
  createPostSchema,
  saveDraftSchema,
  publishPostSchema,
  schedulePostSchema,
  deletePostSchema,
  presignedUploadSchema,
  type CreatePostInput,
  type DeletePostInput,
  type PresignedUploadInput,
  type PublishPostInput,
  type SaveDraftInput,
  type SchedulePostInput,
} from '@/server/blog/validators';
import { upsertPublishSchedule, deletePublishSchedule } from '@/server/blog/scheduler';

async function requireAdmin() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email || !isAdminEmail(email)) {
    throw new Error('Unauthorized');
  }
  return session;
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
  const updated = await publishPostRecord(payload);
  await revalidateContent({
    tags: [`post:${payload.slug}`, 'posts'],
    paths: [`/blog/${payload.slug}`, '/blog', '/sitemap.xml', '/rss.xml'],
  });
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
  await revalidateContent({
    tags: [`post:${payload.slug}`, 'posts'],
    paths: [`/blog/${payload.slug}`, '/blog'],
  });
}

export async function getPresignedUpload(input: PresignedUploadInput) {
  await requireAdmin();
  const payload = presignedUploadSchema.parse(input);
  return generateMediaUploadUrl(payload);
}
