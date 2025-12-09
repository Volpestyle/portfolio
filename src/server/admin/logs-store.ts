/**
 * DynamoDB store for chat log metadata.
 *
 * Uses single-table design with:
 *   PK: 'LOGS'
 *   SK: 'LOG#{filename}'
 */

import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  QueryCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  type QueryCommandOutput,
} from '@aws-sdk/lib-dynamodb';

const PK_LOGS = 'LOGS' as const;
const SK_PREFIX = 'LOG#' as const;

export type ChatLogMetadata = {
  PK: typeof PK_LOGS;
  SK: `${typeof SK_PREFIX}${string}`;
  filename: string;
  s3Key: string;
  timestamp: string;
  sessionId: string;
  messageCount: number;
  tags: string[];
  size: number;
};

export type ChatLogRecord = Omit<ChatLogMetadata, 'PK' | 'SK'>;

let docClient: DynamoDBDocumentClient | undefined;

function getTableName(): string {
  const tableName = process.env.ADMIN_TABLE_NAME ?? process.env.ADMIN_TABLE ?? process.env.DYNAMODB_TABLE;
  if (!tableName) {
    throw new Error('ADMIN_TABLE_NAME (or ADMIN_TABLE/DYNAMODB_TABLE) is required for logs store');
  }
  return tableName;
}

function getDocumentClient(): DynamoDBDocumentClient {
  if (!docClient) {
    const region = process.env.AWS_REGION ?? 'us-east-1';
    docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return docClient;
}

function buildSK(filename: string): `${typeof SK_PREFIX}${string}` {
  return `${SK_PREFIX}${filename}`;
}

function toRecord(item: ChatLogMetadata): ChatLogRecord {
  return {
    filename: item.filename,
    s3Key: item.s3Key,
    timestamp: item.timestamp,
    sessionId: item.sessionId,
    messageCount: item.messageCount,
    tags: Array.isArray(item.tags) ? item.tags : [],
    size: item.size,
  };
}

export type ListLogsOptions = {
  limit?: number;
  tag?: string;
  sessionId?: string;
};

/**
 * List all chat log metadata records.
 * Optionally filter by tag or sessionId (client-side filter).
 */
export async function listChatLogMetadata(options: ListLogsOptions = {}): Promise<ChatLogRecord[]> {
  const client = getDocumentClient();
  const tableName = getTableName();
  const limit = Math.max(1, Math.min(options.limit ?? 100, 500));

  const response = await client.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': PK_LOGS },
      ScanIndexForward: false,
      Limit: limit,
    })
  ) as QueryCommandOutput;

  let records = (response.Items ?? []).map((item) => toRecord(item as ChatLogMetadata));

  if (options.tag) {
    const tagFilter = options.tag.toLowerCase();
    records = records.filter((r) => r.tags.some((t) => t.toLowerCase() === tagFilter));
  }

  if (options.sessionId) {
    const sessionFilter = options.sessionId.toLowerCase();
    records = records.filter((r) => r.sessionId.toLowerCase().includes(sessionFilter));
  }

  return records;
}

/**
 * Get a single chat log metadata record by filename.
 */
export async function getChatLogMetadata(filename: string): Promise<ChatLogRecord | null> {
  const client = getDocumentClient();
  const tableName = getTableName();

  const response = await client.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: {
        ':pk': PK_LOGS,
        ':sk': buildSK(filename),
      },
      Limit: 1,
    })
  ) as QueryCommandOutput;

  const item = response.Items?.[0] as ChatLogMetadata | undefined;
  return item ? toRecord(item) : null;
}

export type CreateLogMetadataInput = {
  filename: string;
  s3Key: string;
  sessionId: string;
  messageCount: number;
  size: number;
  tags?: string[];
};

/**
 * Create a new chat log metadata record.
 */
export async function createChatLogMetadata(input: CreateLogMetadataInput): Promise<ChatLogRecord> {
  const client = getDocumentClient();
  const tableName = getTableName();
  const timestamp = new Date().toISOString();

  const item: ChatLogMetadata = {
    PK: PK_LOGS,
    SK: buildSK(input.filename),
    filename: input.filename,
    s3Key: input.s3Key,
    timestamp,
    sessionId: input.sessionId,
    messageCount: input.messageCount,
    tags: input.tags ?? [],
    size: input.size,
  };

  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: item,
    })
  );

  return toRecord(item);
}

export type UpdateLogMetadataInput = {
  tags?: string[];
};

/**
 * Update chat log metadata (currently only tags).
 */
export async function updateChatLogMetadata(
  filename: string,
  input: UpdateLogMetadataInput
): Promise<ChatLogRecord | null> {
  const client = getDocumentClient();
  const tableName = getTableName();

  const updates: string[] = [];
  const values: Record<string, unknown> = {};

  if (input.tags !== undefined) {
    updates.push('tags = :tags');
    values[':tags'] = input.tags;
  }

  if (updates.length === 0) {
    return getChatLogMetadata(filename);
  }

  await client.send(
    new UpdateCommand({
      TableName: tableName,
      Key: {
        PK: PK_LOGS,
        SK: buildSK(filename),
      },
      UpdateExpression: `SET ${updates.join(', ')}`,
      ExpressionAttributeValues: values,
      ConditionExpression: 'attribute_exists(PK)',
    })
  );

  return getChatLogMetadata(filename);
}

/**
 * Delete chat log metadata by filename.
 */
export async function deleteChatLogMetadata(filename: string): Promise<void> {
  const client = getDocumentClient();
  const tableName = getTableName();

  await client.send(
    new DeleteCommand({
      TableName: tableName,
      Key: {
        PK: PK_LOGS,
        SK: buildSK(filename),
      },
    })
  );
}
