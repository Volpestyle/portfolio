import { isMockBlogStore } from '@/lib/blog-store-mode';

type BlogConfig = {
  region: string;
  tableName: string;
  statusIndexName: string;
  contentBucket: string;
  mediaBucket: string;
  publishLambdaArn?: string;
  schedulerRoleArn?: string;
};

function requiredEnv(value: string | undefined, name: string): string {
  if (!value?.trim()) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

function resolveEnv(value: string | undefined, name: string, mockFallback: string): string {
  if (isMockBlogStore) {
    return value?.trim() ? value : mockFallback;
  }
  return requiredEnv(value, name);
}

export const blogConfig: BlogConfig = {
  region: process.env.AWS_REGION ?? 'us-east-1',
  tableName: resolveEnv(process.env.POSTS_TABLE, 'POSTS_TABLE', 'mock-posts-table'),
  statusIndexName: process.env.POSTS_STATUS_INDEX ?? 'byStatusPublishedAt',
  contentBucket: resolveEnv(process.env.CONTENT_BUCKET, 'CONTENT_BUCKET', 'mock-content-bucket'),
  mediaBucket: resolveEnv(process.env.MEDIA_BUCKET, 'MEDIA_BUCKET', 'mock-media-bucket'),
  publishLambdaArn: process.env.BLOG_PUBLISH_FUNCTION_ARN,
  schedulerRoleArn: process.env.SCHEDULER_ROLE_ARN,
};
