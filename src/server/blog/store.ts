import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import { blogConfig } from '@/server/blog/config';
import { getDocumentClient, getS3Client } from '@/server/blog/clients';
import type { BlogPostRecord, BlogPostStatus, BlogPostSummary, BlogPostWithContent } from '@/types/blog';

const docClient = getDocumentClient();
const s3Client = getS3Client();

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
  return value
    .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
    .filter(Boolean);
}

function toRecord(item?: Record<string, any>): BlogPostRecord | null {
  if (!item) {
    return null;
  }

  const readTimeMinutes = item.readTimeMinutes ? Number(item.readTimeMinutes) : undefined;
  const record: BlogPostRecord = {
    slug: item.slug,
    title: item.title,
    summary: item.summary ?? '',
    status: item.status as BlogPostStatus,
    publishedAt: item.publishedAt,
    updatedAt: item.updatedAt,
    tags: normalizeTags(item.tags),
    heroImageKey: item.heroImageKey,
    readTimeMinutes,
    readTimeLabel: buildReadTimeLabel(readTimeMinutes),
    currentRevisionKey: item.currentRevisionKey,
    version: Number(item.version ?? 1),
    scheduledFor: item.scheduledFor,
    activeScheduleArn: item.activeScheduleArn,
    activeScheduleName: item.activeScheduleName,
  };

  return record;
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

export async function listPublishedPosts(limit: number = 100): Promise<BlogPostSummary[]> {
  const response = await docClient.send(
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
    })
  );

  return (response.Items ?? [])
    .map((item) => toRecord(item))
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
}

export async function getPostWithContent(
  slug: string,
  options: { includeDraft?: boolean } = {}
): Promise<BlogPostWithContent | null> {
  const response = await docClient.send(
    new GetCommand({
      TableName: blogConfig.tableName,
      Key: { slug },
    })
  );

  const record = toRecord(response.Item);
  if (!record) {
    return null;
  }

  if (record.status !== 'published' && !options.includeDraft) {
    return null;
  }

  const content = await fetchRevisionContent(record.currentRevisionKey);
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
  };
}

export async function createPostRecord(input: {
  slug: string;
  title: string;
  summary: string;
  tags?: string[];
  heroImageKey?: string;
}): Promise<BlogPostRecord> {
  const now = new Date().toISOString();
  await docClient.send(
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

  const response = await docClient.send(
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

  const record = toRecord(response.Attributes);
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
  };
}

export async function publishPostRecord(input: {
  slug: string;
  publishedAt?: string;
  expectedVersion: number;
}): Promise<BlogPostRecord> {
  const publishedAt = input.publishedAt ?? new Date().toISOString();
  const nextVersion = input.expectedVersion + 1;

  const response = await docClient.send(
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

  const record = toRecord(response.Attributes);
  if (!record) {
    throw new Error('Unable to publish blog post');
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
  const response = await docClient.send(
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

  const record = toRecord(response.Attributes);
  if (!record) {
    throw new Error('Unable to schedule blog post');
  }
  return record;
}

export async function deletePostRecord(slug: string): Promise<void> {
  const existing = await docClient.send(
    new GetCommand({
      TableName: blogConfig.tableName,
      Key: { slug },
    })
  );

  const record = toRecord(existing.Item);
  if (!record) {
    return;
  }

  await docClient.send(
    new DeleteCommand({
      TableName: blogConfig.tableName,
      Key: { slug },
    })
  );

  if (record.currentRevisionKey) {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: blogConfig.contentBucket,
        Key: record.currentRevisionKey,
      })
    );
  }
}

export async function getPostRecord(slug: string): Promise<BlogPostRecord | null> {
  const response = await docClient.send(
    new GetCommand({
      TableName: blogConfig.tableName,
      Key: { slug },
    })
  );
  return toRecord(response.Item);
}

export async function generateMediaUploadUrl(input: {
  contentType: string;
  extension?: string;
}): Promise<{ uploadUrl: string; key: string }> {
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
