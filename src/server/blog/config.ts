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

export const blogConfig: BlogConfig = {
  region: process.env.AWS_REGION ?? 'us-east-1',
  tableName: requiredEnv(process.env.POSTS_TABLE, 'POSTS_TABLE'),
  statusIndexName: process.env.POSTS_STATUS_INDEX ?? 'byStatusPublishedAt',
  contentBucket: requiredEnv(process.env.CONTENT_BUCKET, 'CONTENT_BUCKET'),
  mediaBucket: requiredEnv(process.env.MEDIA_BUCKET, 'MEDIA_BUCKET'),
  publishLambdaArn: process.env.BLOG_PUBLISH_FUNCTION_ARN,
  schedulerRoleArn: process.env.SCHEDULER_ROLE_ARN,
};
