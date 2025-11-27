import path from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import type { ArtifactWriterConfig } from '../types';
import type { ArtifactWriter } from './types';

function buildKey(prefix: string | undefined, relativePath: string): string {
  const normalized = relativePath.split(path.sep).join('/');
  if (!prefix) {
    return normalized;
  }
  return prefix.replace(/\/+$/, '') + '/' + normalized.replace(/^\/+/, '');
}

export function createS3ArtifactWriter(config: ArtifactWriterConfig): ArtifactWriter {
  const client = new S3Client({
    region: config.region,
  });

  return {
    name: `s3:${config.bucket}`,
    async write(request) {
      const key = buildKey(config.prefix, request.relativePath);
      const body = typeof request.body === 'string' ? request.body : request.body;
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: request.contentType,
          ...(config.kmsKeyId
            ? {
                ServerSideEncryption: 'aws:kms',
                SSEKMSKeyId: config.kmsKeyId,
              }
            : {}),
        })
      );
    },
  };
}
