import { PutObjectCommand, ListObjectsV2Command, GetObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client } from '@aws-sdk/client-s3';
import { createChatLogMetadata, deleteChatLogMetadata } from '@/server/admin/logs-store';

const DEFAULT_PREFIX = 'chat/exports';
const DEFAULT_RETENTION_DAYS = 7;
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const region = process.env.AWS_REGION ?? 'us-east-1';
    s3Client = new S3Client({ region });
  }
  return s3Client;
}

function getExportBucket(): string {
  const bucket = process.env.CHAT_EXPORT_BUCKET;
  if (bucket && bucket.trim()) {
    return bucket;
  }
  throw new Error('CHAT_EXPORT_BUCKET must be configured for chat exports.');
}

function getExportPrefix(): string {
  const rawPrefix = process.env.CHAT_EXPORT_PREFIX ?? DEFAULT_PREFIX;
  const trimmed = rawPrefix.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed;
}

export function sanitizeExportFileName(filename?: string) {
  const fallback = `chat-debug-${new Date().toISOString().replace(/[:]/g, '-')}.md`;
  const targetName = typeof filename === 'string' && filename.trim() ? filename.trim() : fallback;
  const safeName = targetName.replace(/[^a-zA-Z0-9-_.]/g, '_');
  return safeName.endsWith('.md') ? safeName : `${safeName}.md`;
}

function buildExportKey(filename: string): string {
  const prefix = getExportPrefix();
  const sanitized = sanitizeExportFileName(filename);
  return prefix ? `${prefix}/${sanitized}` : sanitized;
}

function assertKeyWithinPrefix(key: string): void {
  const prefix = getExportPrefix();
  if (prefix && !key.startsWith(`${prefix}/`)) {
    throw new Error('Invalid chat export key.');
  }
}

function getRetentionCutoffMs(): number | null {
  const raw = process.env.CHAT_EXPORT_RETENTION_DAYS;
  const days = Number.isFinite(Number(raw)) ? Number(raw) : DEFAULT_RETENTION_DAYS;
  if (days <= 0) return null;
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

export type ChatExportLocation = {
  bucket: string;
  key: string;
  downloadUrl?: string;
};

type UploadOptions = {
  filename?: string;
  exportedBy?: string | null;
  includeDownloadUrl?: boolean;
  urlExpiresInSeconds?: number;
  sessionId?: string;
  messageCount?: number;
};

export async function uploadChatExport(markdown: string, options: UploadOptions = {}): Promise<ChatExportLocation> {
  const bucket = getExportBucket();
  const key = buildExportKey(options.filename ?? '');
  const client = getS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: Buffer.from(markdown, 'utf8'),
      ContentType: 'text/markdown; charset=utf-8',
      Metadata: {
        exportedBy: options.exportedBy ?? 'unknown',
        exportedAt: new Date().toISOString(),
      },
    })
  );

  const location: ChatExportLocation = { bucket, key };

  if (options.includeDownloadUrl) {
    location.downloadUrl = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: options.urlExpiresInSeconds ?? 600 }
    );
  }

  // Write metadata to DynamoDB (best-effort, don't fail upload if this fails)
  const filename = key.split('/').pop() ?? key;
  try {
    await createChatLogMetadata({
      filename,
      s3Key: key,
      sessionId: options.sessionId ?? 'unknown',
      messageCount: options.messageCount ?? 0,
      size: Buffer.byteLength(markdown, 'utf8'),
    });
  } catch (err) {
    console.warn('Failed to write chat log metadata to DynamoDB:', err);
  }

  await pruneExpiredChatExports({ maxDeletions: 200 });

  return location;
}

export type ChatExportSummary = {
  bucket: string;
  key: string;
  size?: number;
  lastModified?: string;
  downloadUrl?: string;
};

type ListOptions = {
  limit?: number;
  includeDownloadUrl?: boolean;
  urlExpiresInSeconds?: number;
};

export async function listChatExports(options: ListOptions = {}): Promise<ChatExportSummary[]> {
  await pruneExpiredChatExports({ maxDeletions: 500 });

  const bucket = getExportBucket();
  const prefix = getExportPrefix();
  const client = getS3Client();
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  const results: ChatExportSummary[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix ? `${prefix}/` : undefined,
        ContinuationToken: continuationToken,
        MaxKeys: limit,
      })
    );

    (response.Contents ?? []).forEach((object) => {
      if (!object.Key) return;
      results.push({
        bucket,
        key: object.Key,
        size: object.Size,
        lastModified: object.LastModified?.toISOString(),
      });
    });

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken && results.length < limit);

  results.sort((a, b) => {
    const aTime = a.lastModified ? new Date(a.lastModified).getTime() : 0;
    const bTime = b.lastModified ? new Date(b.lastModified).getTime() : 0;
    return bTime - aTime;
  });

  if (options.includeDownloadUrl && results.length) {
    await Promise.all(
      results.map(async (item) => {
        try {
          assertKeyWithinPrefix(item.key);
          item.downloadUrl = await getSignedUrl(
            client,
            new GetObjectCommand({ Bucket: bucket, Key: item.key }),
            { expiresIn: options.urlExpiresInSeconds ?? 600 }
          );
        } catch {
          // If signing fails, leave downloadUrl undefined but keep listing entry.
        }
      })
    );
  }

  return results.slice(0, limit);
}

export async function createChatExportDownloadUrl(key: string, expiresInSeconds: number = 600): Promise<string> {
  assertKeyWithinPrefix(key);
  const bucket = getExportBucket();
  const client = getS3Client();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: expiresInSeconds });
}

type PruneOptions = {
  maxDeletions?: number;
};

export async function pruneExpiredChatExports(options: PruneOptions = {}): Promise<number> {
  const cutoff = getRetentionCutoffMs();
  if (!cutoff) return 0;

  const bucket = getExportBucket();
  const prefix = getExportPrefix();
  const client = getS3Client();
  const maxDeletions = Math.max(1, options.maxDeletions ?? 500);
  let deleted = 0;
  let continuationToken: string | undefined;

  try {
    do {
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix ? `${prefix}/` : undefined,
          ContinuationToken: continuationToken,
          MaxKeys: 1000,
        })
      );

      const expiredKeys =
        response.Contents?.filter((object) => {
          if (!object.Key) return false;
          if (prefix && !object.Key.startsWith(`${prefix}/`)) return false;
          const lastModified = object.LastModified?.getTime() ?? 0;
          return lastModified > 0 && lastModified < cutoff;
        }).map((object) => object.Key) ?? [];

      if (expiredKeys.length) {
        const chunk = expiredKeys.slice(0, maxDeletions - deleted);
        if (chunk.length) {
          await client.send(
            new DeleteObjectsCommand({
              Bucket: bucket,
              Delete: {
                Objects: chunk.map((Key) => ({ Key })),
                Quiet: true,
              },
            })
          );
          deleted += chunk.length;

          // Also delete metadata from DynamoDB (best-effort)
          await Promise.all(
            chunk.map(async (key) => {
              const filename = key?.split('/').pop();
              if (filename) {
                try {
                  await deleteChatLogMetadata(filename);
                } catch {
                  // Ignore metadata deletion failures
                }
              }
            })
          );
        }
      }

      if (deleted >= maxDeletions) {
        break;
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);
  } catch {
    // Best-effort cleanup; ignore failures so exports still work.
  }

  return deleted;
}
