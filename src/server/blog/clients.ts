import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { SchedulerClient } from '@aws-sdk/client-scheduler';
import { blogConfig } from '@/server/blog/config';

let dynamoDocClient: DynamoDBDocumentClient | undefined;
let s3Client: S3Client | undefined;
let schedulerClient: SchedulerClient | undefined;

export function getDocumentClient(): DynamoDBDocumentClient {
  if (!dynamoDocClient) {
    dynamoDocClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: blogConfig.region }), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return dynamoDocClient;
}

export function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({ region: blogConfig.region });
  }
  return s3Client;
}

export function getSchedulerClient(): SchedulerClient {
  if (!schedulerClient) {
    schedulerClient = new SchedulerClient({ region: blogConfig.region });
  }
  return schedulerClient;
}
