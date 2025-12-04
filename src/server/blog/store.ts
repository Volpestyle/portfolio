import { PutObjectCommand, GetObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import type {
  GetCommandOutput,
  QueryCommandOutput,
  ScanCommandOutput,
  UpdateCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import { blogConfig } from '@/server/blog/config';
import { getDocumentClient, getS3Client } from '@/server/blog/clients';
import type { BlogPostRecord, BlogPostStatus, BlogPostSummary, BlogPostWithContent } from '@/types/blog';
import { assertNoFixtureFlagsInProd, shouldUseBlogFixtureRuntime } from '@/lib/test-flags';

type RawBlogRecord = {
  slug: string;
  title: string;
  summary?: string;
  status?: BlogPostStatus | string;
  publishedAt?: string;
  updatedAt?: string;
  tags?: unknown;
  heroImageKey?: string;
  readTimeMinutes?: number | string;
  currentRevisionKey?: string;
  version?: number | string;
  scheduledFor?: string;
  activeScheduleArn?: string;
  activeScheduleName?: string;
};

const useMockStore = () => shouldUseBlogFixtureRuntime();
const loadMockStore = async () => {
  assertNoFixtureFlagsInProd();
  return import('@portfolio/test-support/blog/mock-store');
};

const docClient = getDocumentClient();
const rawDocClient = docClient as unknown as { send: (command: unknown) => Promise<unknown> };

// Preserve command outputs without tripping Smithy version skews.
const sendDocumentCommand = async <Output>(command: unknown): Promise<Output> => {
  return rawDocClient.send(command) as Promise<Output>;
};

const s3Client = getS3Client();
const MAX_REVISIONS_PER_POST = 5;
const REVISION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function buildReadTimeLabel(minutes?: number): string | undefined {
  if (!minutes || minutes <= 0) {
    return undefined;
  }
  return `${minutes} min read`;
}

function normalizeTags(value?: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((tag) => (typeof tag === 'string' ? tag.trim() : '')).filter(Boolean);
}

function toRecord(item?: RawBlogRecord | null): BlogPostRecord | null {
  if (!item) {
    return null;
  }

  const readTimeValue = item.readTimeMinutes;
  const readTimeMinutes =
    typeof readTimeValue === 'number'
      ? readTimeValue
      : typeof readTimeValue === 'string'
        ? Number(readTimeValue)
        : undefined;

  const record: BlogPostRecord = {
    slug: item.slug,
    title: item.title,
    summary: item.summary ?? '',
    status: (item.status ?? 'draft') as BlogPostStatus,
    publishedAt: item.publishedAt,
    updatedAt: item.updatedAt ?? new Date().toISOString(),
    tags: normalizeTags(item.tags),
    heroImageKey: item.heroImageKey,
    readTimeMinutes,
    readTimeLabel: buildReadTimeLabel(readTimeMinutes),
    currentRevisionKey: item.currentRevisionKey,
    version: typeof item.version === 'number' ? item.version : Number(item.version ?? 1),
    scheduledFor: item.scheduledFor,
    activeScheduleArn: item.activeScheduleArn,
    activeScheduleName: item.activeScheduleName,
  };

  return record;
}

export class InvalidBlogCursorError extends Error {
  constructor() {
    super('Invalid pagination cursor');
    this.name = 'InvalidBlogCursorError';
  }
}

async function fetchRevisionContent(key?: string): Promise<string> {
  if (!key) {
    return '';
  }
  const object = await s3Client.send(
    new GetObjectCommand({
      Bucket: blogConfig.contentBucket,
      Key: key,
    })
  );
  return object.Body ? await object.Body.transformToString() : '';
}

function estimateReadTime(body: string): number | undefined {
  if (!body?.trim()) {
    return undefined;
  }
  const words = body.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

function buildRevisionKey(slug: string, extension: string = 'md') {
  return `posts/${slug}/rev-${Date.now()}.${extension}`;
}

async function deleteAllRevisions(slug: string) {
  const bucket = blogConfig.contentBucket;
  const prefix = `posts/${slug}/`;
  let continuationToken: string | undefined;

  do {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    const keys = (response.Contents ?? []).map((object) => object.Key).filter((key): key is string => Boolean(key));

    if (keys.length > 0) {
      await s3Client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: keys.map((Key) => ({ Key })),
            Quiet: true,
          },
        })
      );
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);
}

async function pruneRevisions(slug: string, latestKey: string) {
  if (useMockStore()) {
    return;
  }
  const bucket = blogConfig.contentBucket;
  const prefix = `posts/${slug}/`;
  let continuationToken: string | undefined;
  const revisions: { key: string; lastModified: number }[] = [];

  do {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    for (const object of response.Contents ?? []) {
      if (!object.Key || object.Key === latestKey) {
        continue;
      }
      revisions.push({
        key: object.Key,
        lastModified: object.LastModified ? object.LastModified.getTime() : 0,
      });
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  if (!revisions.length) {
    return;
  }

  const now = Date.now();
  const keepBudget = Math.max(0, MAX_REVISIONS_PER_POST - 1);
  const sorted = revisions.sort((a, b) => b.lastModified - a.lastModified);

  const keysToDelete = sorted
    .map((revision, index) => {
      const tooMany = index >= keepBudget;
      const tooOld = revision.lastModified === 0 || now - revision.lastModified > REVISION_TTL_MS;
      return tooMany || tooOld ? revision.key : null;
    })
    .filter((key): key is string => Boolean(key));

  if (!keysToDelete.length) {
    return;
  }

  for (let i = 0; i < keysToDelete.length; i += 1000) {
    const chunk = keysToDelete.slice(i, i + 1000);
    await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: chunk.map((Key) => ({ Key })),
          Quiet: true,
        },
      })
    );
  }
}

export interface PaginatedPosts {
  posts: BlogPostSummary[];
  nextCursor?: string;
  hasMore: boolean;
}

export async function listPublishedPosts(limit: number = 20, cursor?: string): Promise<PaginatedPosts> {
  if (useMockStore()) {
    const store = await loadMockStore();
    const { posts, hasMore, nextCursor } = await store.listPublishedPosts(limit);
    return { posts, hasMore, nextCursor };
  }

  let exclusiveStartKey;
  if (cursor) {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
      exclusiveStartKey = JSON.parse(decoded);
    } catch {
      throw new InvalidBlogCursorError();
    }
  }

  const response = await sendDocumentCommand<QueryCommandOutput>(
    new QueryCommand({
      TableName: blogConfig.tableName,
      IndexName: blogConfig.statusIndexName,
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':status': 'published',
      },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    })
  );

  const posts = (response.Items ?? [])
    .map((item) => toRecord(item as RawBlogRecord))
    .filter((record): record is BlogPostRecord => Boolean(record))
    .map((record) => ({
      slug: record.slug,
      title: record.title,
      summary: record.summary,
      status: record.status,
      publishedAt: record.publishedAt,
      updatedAt: record.updatedAt,
      tags: record.tags,
      heroImageKey: record.heroImageKey,
      readTimeMinutes: record.readTimeMinutes,
      readTimeLabel: record.readTimeLabel,
    }));

  const nextCursor = response.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(response.LastEvaluatedKey)).toString('base64')
    : undefined;

  return {
    posts,
    nextCursor,
    hasMore: !!response.LastEvaluatedKey,
  };
}

export async function listPosts(options: { status?: BlogPostStatus; search?: string } = {}): Promise<BlogPostRecord[]> {
  if (useMockStore()) {
    const store = await loadMockStore();
    return store.listPosts(options);
  }

  const response = await sendDocumentCommand<ScanCommandOutput>(
    new ScanCommand({
      TableName: blogConfig.tableName,
    })
  );

  const searchValue = options.search?.toLowerCase().trim();

  return (response.Items ?? [])
    .map((item) => toRecord(item as RawBlogRecord))
    .filter((record): record is BlogPostRecord => Boolean(record))
    .filter((record) => {
      if (options.status && record.status !== options.status) {
        return false;
      }
      if (searchValue) {
        return record.title.toLowerCase().includes(searchValue) || record.slug.toLowerCase().includes(searchValue);
      }
      return true;
    })
    .sort((a, b) => {
      const aDate = new Date(a.updatedAt).getTime();
      const bDate = new Date(b.updatedAt).getTime();
      return bDate - aDate;
    });
}

export async function getPostWithContent(
  slug: string,
  options: { includeDraft?: boolean } = {}
): Promise<BlogPostWithContent | null> {
  if (useMockStore()) {
    const store = await loadMockStore();
    return store.getPostWithContent(slug, options);
  }

  const response = await sendDocumentCommand<GetCommandOutput>(
    new GetCommand({
      TableName: blogConfig.tableName,
      Key: { slug },
    })
  );

  const record = toRecord(response.Item as RawBlogRecord | null | undefined);
  if (!record) {
    return null;
  }

  if (record.status !== 'published' && !options.includeDraft) {
    return null;
  }

  const content = await fetchRevisionContent(record.currentRevisionKey);
  if (record.currentRevisionKey) {
    await pruneRevisions(slug, record.currentRevisionKey);
  }

  return {
    slug: record.slug,
    title: record.title,
    summary: record.summary,
    status: record.status,
    publishedAt: record.publishedAt,
    updatedAt: record.updatedAt,
    tags: record.tags,
    heroImageKey: record.heroImageKey,
    readTimeMinutes: record.readTimeMinutes,
    readTimeLabel: record.readTimeLabel,
    content,
    currentRevisionKey: record.currentRevisionKey,
    version: record.version,
  };
}

export async function createPostRecord(input: {
  slug: string;
  title: string;
  summary: string;
  tags?: string[];
  heroImageKey?: string;
}): Promise<BlogPostRecord> {
  if (useMockStore()) {
    const store = await loadMockStore();
    return store.createPostRecord(input);
  }

  const now = new Date().toISOString();
  await sendDocumentCommand(
    new PutCommand({
      TableName: blogConfig.tableName,
      Item: {
        slug: input.slug,
        title: input.title,
        summary: input.summary,
        status: 'draft',
        tags: input.tags ?? [],
        heroImageKey: input.heroImageKey,
        updatedAt: now,
        version: 1,
      },
      ConditionExpression: 'attribute_not_exists(slug)',
    })
  );

  return {
    slug: input.slug,
    title: input.title,
    summary: input.summary,
    status: 'draft',
    tags: input.tags ?? [],
    heroImageKey: input.heroImageKey,
    updatedAt: now,
    version: 1,
    readTimeMinutes: undefined,
    readTimeLabel: undefined,
  };
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
  if (useMockStore()) {
    const store = await loadMockStore();
    return store.saveDraftRecord(input);
  }

  const key = buildRevisionKey(input.slug, input.extension);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: blogConfig.contentBucket,
      Key: key,
      Body: input.body,
      ContentType: 'text/markdown; charset=utf-8',
    })
  );

  const now = new Date().toISOString();
  const readTimeMinutes = estimateReadTime(input.body);
  const nextVersion = input.expectedVersion + 1;

  const updates: string[] = ['#updatedAt = :updatedAt', '#currentRevisionKey = :revision', '#version = :nextVersion'];
  const names: Record<string, string> = {
    '#updatedAt': 'updatedAt',
    '#currentRevisionKey': 'currentRevisionKey',
    '#version': 'version',
  };
  const values: Record<string, unknown> = {
    ':updatedAt': now,
    ':revision': key,
    ':nextVersion': nextVersion,
  };

  if (readTimeMinutes) {
    updates.push('#readTimeMinutes = :readTimeMinutes');
    names['#readTimeMinutes'] = 'readTimeMinutes';
    values[':readTimeMinutes'] = readTimeMinutes;
  }
  if (input.title) {
    updates.push('#title = :title');
    names['#title'] = 'title';
    values[':title'] = input.title;
  }
  if (input.summary) {
    updates.push('#summary = :summary');
    names['#summary'] = 'summary';
    values[':summary'] = input.summary;
  }
  if (input.heroImageKey !== undefined) {
    updates.push('#heroImageKey = :heroImageKey');
    names['#heroImageKey'] = 'heroImageKey';
    values[':heroImageKey'] = input.heroImageKey;
  }
  if (input.tags) {
    updates.push('#tags = :tags');
    names['#tags'] = 'tags';
    values[':tags'] = input.tags;
  }

  const response = await sendDocumentCommand<UpdateCommandOutput>(
    new UpdateCommand({
      TableName: blogConfig.tableName,
      Key: { slug: input.slug },
      UpdateExpression: `SET ${updates.join(', ')}`,
      ConditionExpression: '#version = :expectedVersion',
      ExpressionAttributeNames: {
        ...names,
      },
      ExpressionAttributeValues: {
        ...values,
        ':expectedVersion': input.expectedVersion,
      },
      ReturnValues: 'ALL_NEW',
    })
  );

  const record = toRecord(response.Attributes as RawBlogRecord | null | undefined);
  if (!record) {
    throw new Error('Failed to update blog post');
  }

  return {
    slug: record.slug,
    title: record.title,
    summary: record.summary,
    status: record.status,
    publishedAt: record.publishedAt,
    updatedAt: record.updatedAt,
    tags: record.tags,
    heroImageKey: record.heroImageKey,
    readTimeMinutes: record.readTimeMinutes,
    readTimeLabel: record.readTimeLabel,
    content: input.body,
    currentRevisionKey: record.currentRevisionKey,
    version: record.version,
  };
}

export async function publishPostRecord(input: {
  slug: string;
  publishedAt?: string;
  expectedVersion: number;
}): Promise<BlogPostRecord> {
  if (useMockStore()) {
    const store = await loadMockStore();
    return store.publishPostRecord(input);
  }

  const publishedAt = input.publishedAt ?? new Date().toISOString();
  const nextVersion = input.expectedVersion + 1;

  const response = await sendDocumentCommand<UpdateCommandOutput>(
    new UpdateCommand({
      TableName: blogConfig.tableName,
      Key: { slug: input.slug },
      UpdateExpression:
        'SET #status = :status, #publishedAt = :publishedAt, #updatedAt = :updatedAt, #version = :nextVersion REMOVE #scheduledFor, #activeScheduleArn, #activeScheduleName',
      ConditionExpression: '#version = :expectedVersion',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#publishedAt': 'publishedAt',
        '#updatedAt': 'updatedAt',
        '#version': 'version',
        '#scheduledFor': 'scheduledFor',
        '#activeScheduleArn': 'activeScheduleArn',
        '#activeScheduleName': 'activeScheduleName',
      },
      ExpressionAttributeValues: {
        ':status': 'published',
        ':publishedAt': publishedAt,
        ':updatedAt': new Date().toISOString(),
        ':nextVersion': nextVersion,
        ':expectedVersion': input.expectedVersion,
      },
      ReturnValues: 'ALL_NEW',
    })
  );

  const record = toRecord(response.Attributes as RawBlogRecord | null | undefined);
  if (!record) {
    throw new Error('Unable to publish blog post');
  }
  return record;
}

export async function archivePostRecord(input: { slug: string; expectedVersion: number }): Promise<BlogPostRecord> {
  if (useMockStore()) {
    const store = await loadMockStore();
    return store.archivePostRecord(input);
  }

  const response = await sendDocumentCommand<UpdateCommandOutput>(
    new UpdateCommand({
      TableName: blogConfig.tableName,
      Key: { slug: input.slug },
      UpdateExpression:
        'SET #status = :status, #updatedAt = :updatedAt, #version = :nextVersion REMOVE #scheduledFor, #activeScheduleArn, #activeScheduleName',
      ConditionExpression: '#version = :expectedVersion',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#updatedAt': 'updatedAt',
        '#version': 'version',
        '#scheduledFor': 'scheduledFor',
        '#activeScheduleArn': 'activeScheduleArn',
        '#activeScheduleName': 'activeScheduleName',
      },
      ExpressionAttributeValues: {
        ':status': 'archived',
        ':updatedAt': new Date().toISOString(),
        ':nextVersion': input.expectedVersion + 1,
        ':expectedVersion': input.expectedVersion,
      },
      ReturnValues: 'ALL_NEW',
    })
  );

  const record = toRecord(response.Attributes as RawBlogRecord | null | undefined);
  if (!record) {
    throw new Error('Unable to archive blog post');
  }
  return record;
}

export async function markScheduledRecord(input: {
  slug: string;
  scheduledFor: string;
  scheduleArn: string;
  scheduleName: string;
  expectedVersion: number;
}): Promise<BlogPostRecord> {
  if (useMockStore()) {
    const store = await loadMockStore();
    return store.markScheduledRecord(input);
  }

  const response = await sendDocumentCommand<UpdateCommandOutput>(
    new UpdateCommand({
      TableName: blogConfig.tableName,
      Key: { slug: input.slug },
      UpdateExpression:
        'SET #status = :status, #scheduledFor = :scheduledFor, #publishedAt = :publishedFor, #updatedAt = :updatedAt, #version = :nextVersion, #activeScheduleArn = :scheduleArn, #activeScheduleName = :scheduleName',
      ConditionExpression: '#version = :expectedVersion',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#scheduledFor': 'scheduledFor',
        '#publishedAt': 'publishedAt',
        '#updatedAt': 'updatedAt',
        '#version': 'version',
        '#activeScheduleArn': 'activeScheduleArn',
        '#activeScheduleName': 'activeScheduleName',
      },
      ExpressionAttributeValues: {
        ':status': 'scheduled',
        ':scheduledFor': input.scheduledFor,
        ':publishedFor': input.scheduledFor,
        ':updatedAt': new Date().toISOString(),
        ':nextVersion': input.expectedVersion + 1,
        ':scheduleArn': input.scheduleArn,
        ':scheduleName': input.scheduleName,
        ':expectedVersion': input.expectedVersion,
      },
      ReturnValues: 'ALL_NEW',
    })
  );

  const record = toRecord(response.Attributes as RawBlogRecord | null | undefined);
  if (!record) {
    throw new Error('Unable to schedule blog post');
  }
  return record;
}

export async function unmarkScheduledRecord(input: { slug: string; expectedVersion: number }): Promise<BlogPostRecord> {
  if (useMockStore()) {
    const store = await loadMockStore();
    return store.unmarkScheduledRecord(input);
  }

  const response = await sendDocumentCommand<UpdateCommandOutput>(
    new UpdateCommand({
      TableName: blogConfig.tableName,
      Key: { slug: input.slug },
      UpdateExpression:
        'SET #status = :status, #updatedAt = :updatedAt, #version = :nextVersion REMOVE #scheduledFor, #publishedAt, #activeScheduleArn, #activeScheduleName',
      ConditionExpression: '#version = :expectedVersion',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#updatedAt': 'updatedAt',
        '#version': 'version',
        '#scheduledFor': 'scheduledFor',
        '#publishedAt': 'publishedAt',
        '#activeScheduleArn': 'activeScheduleArn',
        '#activeScheduleName': 'activeScheduleName',
      },
      ExpressionAttributeValues: {
        ':status': 'draft',
        ':updatedAt': new Date().toISOString(),
        ':nextVersion': input.expectedVersion + 1,
        ':expectedVersion': input.expectedVersion,
      },
      ReturnValues: 'ALL_NEW',
    })
  );

  const record = toRecord(response.Attributes as RawBlogRecord | null | undefined);
  if (!record) {
    throw new Error('Unable to unschedule blog post');
  }
  return record;
}

export async function deletePostRecord(slug: string): Promise<void> {
  if (useMockStore()) {
    const store = await loadMockStore();
    return store.deletePostRecord(slug);
  }

  const existing = await sendDocumentCommand<GetCommandOutput>(
    new GetCommand({
      TableName: blogConfig.tableName,
      Key: { slug },
    })
  );

  const record = toRecord(existing.Item as RawBlogRecord | null | undefined);
  if (!record) {
    return;
  }

  await sendDocumentCommand(
    new DeleteCommand({
      TableName: blogConfig.tableName,
      Key: { slug },
    })
  );

  await deleteAllRevisions(slug);
}

export async function getPostRecord(slug: string): Promise<BlogPostRecord | null> {
  if (useMockStore()) {
    const store = await loadMockStore();
    return store.getPostRecord(slug);
  }

  const response = await sendDocumentCommand<GetCommandOutput>(
    new GetCommand({
      TableName: blogConfig.tableName,
      Key: { slug },
    })
  );
  return toRecord(response.Item as RawBlogRecord | null | undefined);
}

export async function generateMediaUploadUrl(input: {
  contentType: string;
  extension?: string;
}): Promise<{ uploadUrl: string; key: string }> {
  if (useMockStore()) {
    const store = await loadMockStore();
    return store.generateMediaUploadUrl(input);
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const ext = (input.extension ?? 'bin').replace(/[^a-zA-Z0-9]/g, '');
  const key = `images/${year}/${month}/${randomUUID()}.${ext || 'bin'}`;

  const command = new PutObjectCommand({
    Bucket: blogConfig.mediaBucket,
    Key: key,
    ContentType: input.contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 * 5 });
  return { uploadUrl, key };
}
