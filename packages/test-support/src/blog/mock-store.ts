import type { BlogPostRecord, BlogPostStatus, BlogPostSummary, BlogPostWithContent } from '@/types/blog';
import { TEST_BLOG_POSTS } from '../fixtures';

type MockPost = BlogPostWithContent;

const posts = new Map<string, MockPost>();

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function ensureSeeded() {
  if (posts.size) {
    return;
  }
  for (const post of TEST_BLOG_POSTS) {
    posts.set(post.slug, clone(post));
  }
}

function buildReadTimeLabel(minutes?: number) {
  if (!minutes || minutes <= 0) {
    return undefined;
  }
  return `${minutes} min read`;
}

function estimateReadTime(body: string): number | undefined {
  if (!body?.trim()) {
    return undefined;
  }
  const words = body.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

function requirePost(slug: string): MockPost {
  ensureSeeded();
  const existing = posts.get(slug);
  if (!existing) {
    throw new Error(`Post "${slug}" not found`);
  }
  return existing;
}

function savePost(next: MockPost): MockPost {
  posts.set(next.slug, clone(next));
  return clone(next);
}

function toRecord(post: MockPost): BlogPostRecord {
  const { content, ...record } = post;
  void content;
  return record;
}

function toWithContent(post: MockPost): BlogPostWithContent {
  return clone(post);
}

function applySearchFilter(record: BlogPostRecord, search?: string | null) {
  if (!search) {
    return true;
  }
  const normalized = search.toLowerCase().trim();
  if (!normalized) {
    return true;
  }
  return record.title.toLowerCase().includes(normalized) || record.slug.toLowerCase().includes(normalized);
}

function assertVersion(record: BlogPostRecord, expected: number) {
  if (record.version !== expected) {
    throw new Error('Version mismatch while updating post');
  }
}

export async function listPublishedPosts(
  limit: number = 20
): Promise<{ posts: BlogPostSummary[]; hasMore: boolean; nextCursor?: string }> {
  ensureSeeded();
  const allPosts = Array.from(posts.values())
    .filter((post) => post.status === 'published')
    .sort((a, b) => {
      const aTime = new Date(a.publishedAt ?? a.updatedAt).getTime();
      const bTime = new Date(b.publishedAt ?? b.updatedAt).getTime();
      return bTime - aTime;
    });

  const postsSlice = allPosts.slice(0, limit).map((post) => {
    const { content, version, ...rest } = post;
    void content;
    void version;
    return { ...rest };
  });

  return {
    posts: postsSlice,
    hasMore: false, // Mock store doesn't implement cursor pagination
    nextCursor: undefined,
  };
}

export async function listPosts(options: { status?: BlogPostStatus; search?: string } = {}): Promise<BlogPostRecord[]> {
  ensureSeeded();
  return Array.from(posts.values())
    .map((post) => toRecord(post))
    .filter((record) => {
      if (options.status && record.status !== options.status) {
        return false;
      }
      return applySearchFilter(record, options.search);
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function getPostWithContent(
  slug: string,
  options: { includeDraft?: boolean } = {}
): Promise<BlogPostWithContent | null> {
  const post = requirePost(slug);
  if (post.status !== 'published' && !options.includeDraft) {
    return null;
  }
  return toWithContent(post);
}

export async function createPostRecord(input: {
  slug: string;
  title: string;
  summary: string;
  tags?: string[];
  heroImageKey?: string;
}): Promise<BlogPostRecord> {
  ensureSeeded();
  if (posts.has(input.slug)) {
    throw new Error('A post with that slug already exists');
  }
  const now = new Date().toISOString();
  const post: MockPost = {
    slug: input.slug,
    title: input.title,
    summary: input.summary,
    status: 'draft',
    tags: input.tags ?? [],
    heroImageKey: input.heroImageKey,
    updatedAt: now,
    publishedAt: undefined,
    readTimeMinutes: undefined,
    readTimeLabel: undefined,
    currentRevisionKey: `mock-rev-${input.slug}`,
    version: 1,
    content: '',
  };
  savePost(post);
  return toRecord(post);
}

export async function saveDraftRecord(input: {
  slug: string;
  body: string;
  title?: string;
  summary?: string;
  tags?: string[];
  heroImageKey?: string;
  extension?: string;
  expectedVersion: number;
}): Promise<BlogPostWithContent> {
  const existing = requirePost(input.slug);
  assertVersion(existing, input.expectedVersion);

  const readTimeMinutes = estimateReadTime(input.body);
  const updated: MockPost = {
    ...existing,
    title: input.title ?? existing.title,
    summary: input.summary ?? existing.summary,
    tags: input.tags ?? existing.tags,
    heroImageKey: input.heroImageKey ?? existing.heroImageKey,
    updatedAt: new Date().toISOString(),
    currentRevisionKey: `mock-rev-${input.slug}-${Date.now()}`,
    version: existing.version + 1,
    content: input.body,
    readTimeMinutes,
    readTimeLabel: buildReadTimeLabel(readTimeMinutes),
  };
  savePost(updated);
  return toWithContent(updated);
}

export async function publishPostRecord(input: {
  slug: string;
  publishedAt?: string;
  expectedVersion: number;
}): Promise<BlogPostRecord> {
  const existing = requirePost(input.slug);
  assertVersion(existing, input.expectedVersion);
  const update: MockPost = {
    ...existing,
    status: 'published',
    publishedAt: input.publishedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    readTimeLabel: buildReadTimeLabel(existing.readTimeMinutes),
    currentRevisionKey: `mock-rev-${input.slug}-${Date.now()}`,
    version: existing.version + 1,
  };
  savePost(update);
  return toRecord(update);
}

export async function deletePost(slug: string): Promise<void> {
  posts.delete(slug);
}

export async function deleteAllPosts(): Promise<void> {
  posts.clear();
}

export async function deleteDraft(slug: string): Promise<void> {
  const existing = requirePost(slug);
  if (existing.status !== 'draft') {
    throw new Error('Cannot delete draft; post is already published');
  }
  posts.delete(slug);
}

export async function setPostPublishState(input: {
  slug: string;
  scheduledFor?: string | null;
  expectedVersion: number;
}): Promise<BlogPostRecord> {
  const existing = requirePost(input.slug);
  assertVersion(existing, input.expectedVersion);
  const update: MockPost = {
    ...existing,
    scheduledFor: input.scheduledFor ?? undefined,
    updatedAt: new Date().toISOString(),
    version: existing.version + 1,
  };
  savePost(update);
  return toRecord(update);
}

export async function createRevision(input: {
  slug: string;
  content: string;
  extension?: string;
  expectedVersion: number;
}): Promise<{ revisionKey: string }> {
  const existing = requirePost(input.slug);
  assertVersion(existing, input.expectedVersion);
  const revisionKey = `mock-rev-${input.slug}-${Date.now()}.${input.extension || 'md'}`;
  savePost({
    ...existing,
    content: input.content,
    updatedAt: new Date().toISOString(),
    currentRevisionKey: revisionKey,
    version: existing.version + 1,
  });
  return { revisionKey };
}

export async function archivePostRecord(input: { slug: string; expectedVersion: number }): Promise<BlogPostRecord> {
  const existing = requirePost(input.slug);
  assertVersion(existing, input.expectedVersion);
  const update: MockPost = {
    ...existing,
    status: 'archived',
    updatedAt: new Date().toISOString(),
    scheduledFor: undefined,
    activeScheduleArn: undefined,
    activeScheduleName: undefined,
    version: existing.version + 1,
  };
  savePost(update);
  return toRecord(update);
}

export async function markScheduledRecord(input: {
  slug: string;
  scheduledFor: string;
  scheduleArn: string;
  scheduleName: string;
  expectedVersion: number;
}): Promise<BlogPostRecord> {
  const existing = requirePost(input.slug);
  assertVersion(existing, input.expectedVersion);
  const update: MockPost = {
    ...existing,
    status: 'scheduled',
    scheduledFor: input.scheduledFor,
    activeScheduleArn: input.scheduleArn,
    activeScheduleName: input.scheduleName,
    updatedAt: new Date().toISOString(),
    version: existing.version + 1,
  };
  savePost(update);
  return toRecord(update);
}

export async function unmarkScheduledRecord(input: { slug: string; expectedVersion: number }): Promise<BlogPostRecord> {
  const existing = requirePost(input.slug);
  assertVersion(existing, input.expectedVersion);
  const update: MockPost = {
    ...existing,
    status: 'draft',
    scheduledFor: undefined,
    activeScheduleArn: undefined,
    activeScheduleName: undefined,
    updatedAt: new Date().toISOString(),
    version: existing.version + 1,
  };
  savePost(update);
  return toRecord(update);
}

export async function deletePostRecord(slug: string): Promise<void> {
  posts.delete(slug);
}

export async function getPostRecord(slug: string): Promise<BlogPostRecord | null> {
  const post = posts.get(slug);
  return post ? toRecord(post) : null;
}

export async function generateMediaUploadUrl(input: {
  contentType: string;
  extension?: string;
}): Promise<{ uploadUrl: string; key: string }> {
  const ext = (input.extension ?? 'bin').replace(/[^a-zA-Z0-9]/g, '');
  const key = `images/mock/${Date.now()}.${ext || 'bin'}`;
  // In tests we don't actually upload; return deterministic URL
  return { uploadUrl: `https://mock-upload.local/${key}`, key };
}
