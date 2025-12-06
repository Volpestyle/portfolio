// Only import server-only in Next.js environment (not when running with tsx/node directly)
if (typeof process !== 'undefined' && process.env.NEXT_RUNTIME) {
  import('server-only').catch(() => {});
}

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

export type RuntimeCostClients = {
  dynamo: DynamoDBClient;
  cloudwatch: CloudWatchClient;
  sns?: SNSClient;
  tableName: string;
  alertTopicArn?: string;
  env: string;
  budgetUsd: number;
};

const TTL_GRACE_DAYS = 35;
const WARNING_THRESHOLD = 80;
const CRITICAL_THRESHOLD = 95;

let cachedClients: { key: string; clients: RuntimeCostClients } | null = null;
let configuredBudgetUsd: number | null = null;

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

export function setRuntimeCostBudget(budgetUsd?: number | null): void {
  if (typeof budgetUsd === 'number' && Number.isFinite(budgetUsd) && budgetUsd > 0) {
    configuredBudgetUsd = budgetUsd;
    return;
  }
  configuredBudgetUsd = null;
}

function buildMonthKey(now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function evaluateCostState(
  spendUsd: number,
  turnCount: number,
  budgetUsd: number,
  now = new Date()
): RuntimeCostState {
  const safeBudget = budgetUsd > 0 ? budgetUsd : Number.POSITIVE_INFINITY;
  const remainingUsd = Math.max(0, safeBudget - spendUsd);
  const percentUsed = Number.isFinite(safeBudget) ? (spendUsd / safeBudget) * 100 : 0;
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
  { turnCostUsd, monthTotalUsd, now = new Date() }: { turnCostUsd: number; monthTotalUsd: number; now?: Date }
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
            { Name: 'Env', Value: clients.env },
            { Name: 'YearMonth', Value: yearMonth },
          ],
        },
      ],
    })
  );
}

function getEnvKey(env: string): string {
  return env;
}

export async function getRuntimeCostClients(): Promise<RuntimeCostClients | null> {
  if (!configuredBudgetUsd || configuredBudgetUsd <= 0) {
    return null;
  }
  const tableName = process.env.COST_TABLE_NAME ?? process.env.CHAT_COST_TABLE_NAME;
  if (!tableName) {
    return null;
  }

  const alertTopicArn = process.env.COST_ALERT_TOPIC_ARN ?? process.env.CHAT_COST_ALERT_TOPIC_ARN;

  const env = resolveEnv();
  const cacheKey = [tableName, alertTopicArn, env, configuredBudgetUsd ?? 'none'].join('|');
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
      budgetUsd: configuredBudgetUsd,
    },
  };
  return cachedClients.clients;
}

export async function getRuntimeCostState(clients: RuntimeCostClients): Promise<RuntimeCostState> {
  const now = new Date();
  const yearMonth = buildMonthKey(now);
  const key = {
    owner_env: { S: getEnvKey(clients.env) },
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
  return evaluateCostState(spendUsd, turnCount, clients.budgetUsd, now);
}

export async function recordRuntimeCost(
  clients: RuntimeCostClients,
  costUsd: number,
  logger?: Logger
): Promise<RuntimeCostState> {
  const previous = await getRuntimeCostState(clients);
  const increment = Number.isFinite(costUsd) && costUsd > 0 ? costUsd : 0;
  const now = new Date();
  const yearMonth = buildMonthKey(now);
  const key = {
    owner_env: { S: getEnvKey(clients.env) },
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
  const state = evaluateCostState(spendUsd, turnCount, clients.budgetUsd, now);

  try {
    await publishCostMetrics(clients, { turnCostUsd: increment, monthTotalUsd: spendUsd, now });
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

export async function shouldThrottleForBudget(clients: RuntimeCostClients, logger?: Logger): Promise<RuntimeCostState> {
  try {
    const state = await getRuntimeCostState(clients);
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
    return evaluateCostState(0, 0, clients.budgetUsd);
  }
}
