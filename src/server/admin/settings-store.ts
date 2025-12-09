/**
 * DynamoDB store for admin settings.
 *
 * Uses single-table design with:
 *   PK: 'SETTINGS'
 *   SK: 'CONFIG'
 */

import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand, type GetCommandOutput } from '@aws-sdk/lib-dynamodb';

const PK_SETTINGS = 'SETTINGS' as const;
const SK_CONFIG = 'CONFIG' as const;

export type AdminSettings = {
  monthlyCostLimitUsd: number;
  chatEnabled: boolean;
  updatedAt: string;
};

type SettingsRow = AdminSettings & {
  PK: typeof PK_SETTINGS;
  SK: typeof SK_CONFIG;
  // Legacy support
  costThresholdUsd?: number;
};

const DEFAULT_SETTINGS: AdminSettings = {
  monthlyCostLimitUsd: 10,
  chatEnabled: true,
  updatedAt: new Date().toISOString(),
};

let docClient: DynamoDBDocumentClient | undefined;

function getTableName(): string {
  const tableName = process.env.ADMIN_TABLE_NAME ?? process.env.ADMIN_TABLE ?? process.env.DYNAMODB_TABLE;
  if (!tableName) {
    throw new Error('ADMIN_TABLE_NAME (or ADMIN_TABLE/DYNAMODB_TABLE) is required for settings store');
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

function toSettings(item?: SettingsRow | null): AdminSettings {
  if (!item) {
    return { ...DEFAULT_SETTINGS };
  }
  const monthlyCostLimitUsd =
    typeof item.monthlyCostLimitUsd === 'number'
      ? item.monthlyCostLimitUsd
      : typeof item.costThresholdUsd === 'number'
        ? item.costThresholdUsd
        : DEFAULT_SETTINGS.monthlyCostLimitUsd;

  return {
    monthlyCostLimitUsd,
    chatEnabled: typeof item.chatEnabled === 'boolean' ? item.chatEnabled : DEFAULT_SETTINGS.chatEnabled,
    updatedAt: item.updatedAt ?? DEFAULT_SETTINGS.updatedAt,
  };
}

/**
 * Get current admin settings. Returns defaults if not yet configured.
 */
export async function getSettings(): Promise<AdminSettings> {
  const client = getDocumentClient();
  const tableName = getTableName();

  const response = (await client.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: PK_SETTINGS,
        SK: SK_CONFIG,
      },
    })
  )) as GetCommandOutput;

  return toSettings(response.Item as SettingsRow | undefined);
}

export type UpdateSettingsInput = {
  monthlyCostLimitUsd?: number;
  chatEnabled?: boolean;
};

/**
 * Update admin settings. Merges with existing settings.
 */
export async function updateSettings(input: UpdateSettingsInput): Promise<AdminSettings> {
  const client = getDocumentClient();
  const tableName = getTableName();

  // Get current settings to merge
  const current = await getSettings();

  const updated: SettingsRow = {
    PK: PK_SETTINGS,
    SK: SK_CONFIG,
    monthlyCostLimitUsd: input.monthlyCostLimitUsd ?? current.monthlyCostLimitUsd,
    chatEnabled: input.chatEnabled ?? current.chatEnabled,
    updatedAt: new Date().toISOString(),
  };

  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: updated,
    })
  );

  return toSettings(updated);
}

/**
 * Check if chat is enabled. Returns true if settings not configured (fail open).
 */
export async function isChatEnabled(): Promise<boolean> {
  try {
    const settings = await getSettings();
    return settings.chatEnabled;
  } catch {
    // Fail open - if we can't read settings, allow chat
    return true;
  }
}

/**
 * Get the monthly cost limit in USD. Returns default if not configured.
 */
export async function getMonthlyCostLimit(): Promise<number> {
  try {
    const settings = await getSettings();
    return settings.monthlyCostLimitUsd;
  } catch {
    return DEFAULT_SETTINGS.monthlyCostLimitUsd;
  }
}

// Backwards-compatible alias
export const getCostThreshold = getMonthlyCostLimit;
