import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createChatLogMetadata } from '@/server/admin/logs-store';

const DEFAULT_PREFIX = 'chat/logs';
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const region = process.env.AWS_REGION ?? 'us-east-1';
    s3Client = new S3Client({ region });
  }
  return s3Client;
}

function getLogBucket(): string {
  const bucket =
    process.env.CHAT_LOG_BUCKET ||
    process.env.CHAT_EXPORT_BUCKET ||
    process.env.CONTENT_BUCKET;
  if (!bucket) {
    throw new Error('CHAT_LOG_BUCKET (or CHAT_EXPORT_BUCKET/CONTENT_BUCKET) must be configured for chat logs.');
  }
  return bucket;
}

function getLogPrefix(): string {
  const raw = process.env.CHAT_LOG_PREFIX ?? DEFAULT_PREFIX;
  return raw.replace(/^\/+/, '').replace(/\/+$/, '');
}

export function sanitizeLogFileName(filename?: string, extension: 'json' | 'md' = 'json') {
  const fallback = `chat-log-${new Date().toISOString().replace(/[:]/g, '-')}.${extension}`;
  const targetName = typeof filename === 'string' && filename.trim() ? filename.trim() : fallback;
  const safeName = targetName.replace(/[^a-zA-Z0-9-_.]/g, '_');
  return safeName.endsWith(`.${extension}`) ? safeName : `${safeName}.${extension}`;
}

function buildLogKey(filename: string, timestamp: Date = new Date()): string {
  const yearMonth = `${timestamp.getUTCFullYear()}-${String(timestamp.getUTCMonth() + 1).padStart(2, '0')}`;
  const prefix = getLogPrefix();
  const safeName = sanitizeLogFileName(filename, 'json');
  return prefix ? `${prefix}/${yearMonth}/${safeName}` : `${yearMonth}/${safeName}`;
}

export type UploadChatLogInput = {
  filename?: string;
  sessionId?: string;
  tags?: string[];
  messageCount?: number;
  body: unknown;
  timestamp?: Date;
};

export async function uploadChatLog(input: UploadChatLogInput) {
  const bucket = getLogBucket();
  const timestamp = input.timestamp ?? new Date();
  const filename = sanitizeLogFileName(input.filename, 'json');
  const key = buildLogKey(filename, timestamp);
  const client = getS3Client();

  const serialized =
    typeof input.body === 'string'
      ? input.body
      : JSON.stringify(input.body, null, 2);

  const size = Buffer.byteLength(serialized, 'utf8');
  const sessionId = input.sessionId?.trim() || 'unknown';

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: serialized,
      ContentType: 'application/json; charset=utf-8',
      Metadata: {
        sessionId,
        tags: Array.isArray(input.tags) ? input.tags.join(',') : '',
        createdAt: timestamp.toISOString(),
      },
    })
  );

  // Persist metadata (best effort)
  try {
    await createChatLogMetadata({
      filename,
      s3Key: key,
      sessionId,
      messageCount: input.messageCount ?? 0,
      size,
      tags: Array.isArray(input.tags) ? input.tags : [],
    });
  } catch (error) {
    console.warn('[chat-logs] Failed to write metadata', error);
  }

  return { bucket, key, filename, size, sessionId };
}

export async function fetchChatLogBody(s3Key: string): Promise<string | null> {
  const bucket = getLogBucket();
  const client = getS3Client();

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: s3Key,
      })
    );
    const body = await response.Body?.transformToString();
    return body ?? null;
  } catch (error) {
    console.warn('[chat-logs] Failed to fetch log body', error);
    return null;
  }
}
