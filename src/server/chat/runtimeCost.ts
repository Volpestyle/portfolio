import 'server-only';

import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';

export type CostLevel = 'ok' | 'warning' | 'critical' | 'exceeded';

export type RuntimeCostState = {
  monthKey: string;
  spendUsd: number;
  turnCount: number;
  budgetUsd: number;
  percentUsed: number;
  remainingUsd: number;
  level: CostLevel;
  estimatedTurnsRemaining: number;
  updatedAt: string;
};

type Logger = (event: string, payload: Record<string, unknown>) => void;

type RuntimeCostClients = {
  dynamo: DynamoDBClient;
  cloudwatch: CloudWatchClient;
  sns?: SNSClient;
  tableName: string;
  alertTopicArn?: string;
  env: string;
};

const TTL_GRACE_DAYS = 35;
const DEFAULT_BUDGET_USD = 10;
const WARNING_THRESHOLD = 80;
const CRITICAL_THRESHOLD = 95;

let cachedClients: { key: string; clients: RuntimeCostClients } | null = null;

function parseNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function resolveEnv(): string {
  const env = process.env.APP_ENV ?? process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV ?? 'development';
  if (env === 'production') return 'prod';
  return env;
}

function resolveAppId(appId?: string): string {
  const fromArg = appId?.trim();
  if (fromArg) return fromArg;
  const fromEnv = process.env.COST_APP_ID ?? process.env.NEXT_PUBLIC_APP_NAME ?? process.env.APP_NAME;
  if (fromEnv && fromEnv.trim()) {
    return fromEnv.trim();
  }
  return 'portfolio';
}

function resolveBudget(): number {
  const parsed = Number.parseFloat(process.env.CHAT_MONTHLY_BUDGET_USD ?? '');
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_BUDGET_USD;
}

function buildMonthKey(now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function evaluateCostState(spendUsd: number, turnCount: number, budgetUsd: number, now = new Date()): RuntimeCostState {
  const remainingUsd = Math.max(0, budgetUsd - spendUsd);
  const percentUsed = budgetUsd > 0 ? (spendUsd / budgetUsd) * 100 : 0;
  let level: CostLevel = 'ok';
  if (percentUsed >= 100) {
    level = 'exceeded';
  } else if (percentUsed >= CRITICAL_THRESHOLD) {
    level = 'critical';
  } else if (percentUsed >= WARNING_THRESHOLD) {
    level = 'warning';
  }
  const avgCostPerTurn = turnCount > 0 ? spendUsd / turnCount : 0;
  const estimatedTurnsRemaining = avgCostPerTurn > 0 ? Math.floor(remainingUsd / avgCostPerTurn) : 0;

  return {
    monthKey: buildMonthKey(now),
    spendUsd,
    turnCount,
    budgetUsd,
    percentUsed,
    remainingUsd,
    level,
    estimatedTurnsRemaining,
    updatedAt: now.toISOString(),
  };
}

function computeTtlSeconds(now = new Date()): number {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const monthEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
  const ttlDate = new Date(monthEnd.getTime() + TTL_GRACE_DAYS * 24 * 60 * 60 * 1000);
  return Math.floor(ttlDate.getTime() / 1000);
}

async function publishCostMetrics(
  clients: RuntimeCostClients,
  {
    turnCostUsd,
    monthTotalUsd,
    appId,
    now = new Date(),
  }: { turnCostUsd: number; monthTotalUsd: number; appId: string; now?: Date }
) {
  const yearMonth = buildMonthKey(now);
  await clients.cloudwatch.send(
    new PutMetricDataCommand({
      Namespace: 'PortfolioChat/Costs',
      MetricData: [
        {
          MetricName: 'RuntimeCostTurnUsd',
          Value: turnCostUsd,
          Unit: StandardUnit.None,
          StorageResolution: 60,
          Dimensions: [
            { Name: 'App', Value: appId },
            { Name: 'Env', Value: clients.env },
            { Name: 'YearMonth', Value: yearMonth },
          ],
        },
        {
          MetricName: 'RuntimeCostMtdUsd',
          Value: monthTotalUsd,
          Unit: StandardUnit.None,
          StorageResolution: 60,
          Dimensions: [
            { Name: 'App', Value: appId },
            { Name: 'Env', Value: clients.env },
            { Name: 'YearMonth', Value: yearMonth },
          ],
        },
      ],
    })
  );
}

function buildOwnerKey(appId: string, env: string): string {
  return `${appId}#${env}`;
}

export async function getRuntimeCostClients(): Promise<RuntimeCostClients | null> {
  const tableName = process.env.COST_TABLE_NAME ?? process.env.CHAT_COST_TABLE_NAME;
  if (!tableName) {
    return null;
  }

  const alertTopicArn = process.env.COST_ALERT_TOPIC_ARN ?? process.env.CHAT_COST_ALERT_TOPIC_ARN;

  const env = resolveEnv();
  const cacheKey = [tableName, alertTopicArn, env].join('|');
  if (cachedClients?.key === cacheKey) {
    return cachedClients.clients;
  }

  cachedClients = {
    key: cacheKey,
    clients: {
      dynamo: new DynamoDBClient({}),
      cloudwatch: new CloudWatchClient({}),
      sns: alertTopicArn ? new SNSClient({}) : undefined,
      tableName,
      alertTopicArn,
      env,
    },
  };
  return cachedClients.clients;
}

export async function getRuntimeCostState(
  clients: RuntimeCostClients,
  options: { appId?: string; budgetUsd?: number } = {}
): Promise<RuntimeCostState> {
  const now = new Date();
  const yearMonth = buildMonthKey(now);
  const resolvedAppId = resolveAppId(options.appId);
  const key = {
    owner_env: { S: buildOwnerKey(resolvedAppId, clients.env) },
    year_month: { S: yearMonth },
  } as const;

  const result = await clients.dynamo.send(
    new GetItemCommand({
      TableName: clients.tableName,
      Key: key,
      ProjectionExpression: 'monthTotalUsd, turnCount, updatedAt',
    })
  );

  const spendUsd = parseNumber(result.Item?.monthTotalUsd?.N ?? 0);
  const turnCount = Math.max(0, Math.floor(parseNumber(result.Item?.turnCount?.N ?? 0)));
  const budgetUsd =
    typeof options.budgetUsd === 'number' && Number.isFinite(options.budgetUsd)
      ? options.budgetUsd
      : resolveBudget();
  return evaluateCostState(spendUsd, turnCount, budgetUsd, now);
}

export async function recordRuntimeCost(
  clients: RuntimeCostClients,
  costUsd: number,
  logger?: Logger,
  options: { appId?: string } = {}
): Promise<RuntimeCostState> {
  const resolvedAppId = resolveAppId(options.appId);
  const previous = await getRuntimeCostState(clients, { appId: resolvedAppId });
  const increment = Number.isFinite(costUsd) && costUsd > 0 ? costUsd : 0;
  const now = new Date();
  const yearMonth = buildMonthKey(now);
  const key = {
    owner_env: { S: buildOwnerKey(resolvedAppId, clients.env) },
    year_month: { S: yearMonth },
  } as const;

  const update = await clients.dynamo.send(
    new UpdateItemCommand({
      TableName: clients.tableName,
      Key: key,
      UpdateExpression: 'ADD monthTotalUsd :delta, turnCount :one SET updatedAt = :now, expiresAt = :ttl',
      ExpressionAttributeValues: {
        ':delta': { N: increment.toFixed(6) },
        ':one': { N: '1' },
        ':now': { S: now.toISOString() },
        ':ttl': { N: computeTtlSeconds(now).toString() },
      },
      ReturnValues: 'UPDATED_NEW',
    })
  );

  const spendUsd = parseNumber(update.Attributes?.monthTotalUsd?.N ?? 0);
  const turnCount = Math.max(0, Math.floor(parseNumber(update.Attributes?.turnCount?.N ?? 0)));
  const state = evaluateCostState(spendUsd, turnCount, resolveBudget(), now);

  try {
    await publishCostMetrics(clients, {
      turnCostUsd: increment,
      monthTotalUsd: spendUsd,
      appId: resolvedAppId,
      now,
    });
  } catch (error) {
    logger?.('chat.cost.metrics_error', { error: String(error) });
  }

  if (clients.sns && clients.alertTopicArn) {
    try {
      const levels: CostLevel[] = ['ok', 'warning', 'critical', 'exceeded'];
      const levelIncreased = levels.indexOf(state.level) > levels.indexOf(previous.level);
      if (levelIncreased && (state.level === 'critical' || state.level === 'exceeded')) {
        await clients.sns.send(
          new PublishCommand({
            TopicArn: clients.alertTopicArn,
            Subject: `Chat runtime cost ${state.level}`,
            Message: JSON.stringify({
              env: clients.env,
              level: state.level,
              spendUsd: state.spendUsd,
              budgetUsd: state.budgetUsd,
              percentUsed: state.percentUsed,
              estimatedTurnsRemaining: state.estimatedTurnsRemaining,
              updatedAt: state.updatedAt,
            }),
          })
        );
      }
    } catch (error) {
      logger?.('chat.cost.alert_error', { error: String(error) });
    }
  }

  return state;
}

export async function shouldThrottleForBudget(
  clients: RuntimeCostClients,
  logger?: Logger,
  options: { appId?: string; budgetUsd?: number } = {}
): Promise<RuntimeCostState> {
  try {
    const state = await getRuntimeCostState(clients, options);
    if (state.level === 'critical' || state.level === 'exceeded') {
      logger?.('chat.cost.budget_block', {
        level: state.level,
        spendUsd: state.spendUsd,
        budgetUsd: state.budgetUsd,
        percentUsed: state.percentUsed,
      });
    }
    return state;
  } catch (error) {
    logger?.('chat.cost.budget_check_error', { error: String(error) });
    return evaluateCostState(0, 0, resolveBudget());
  }
}
