import 'server-only';

import { Redis } from '@upstash/redis';
import { resolveSecretValue } from '@/lib/secrets/manager';

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

export type CostAlertEmailConfig = {
  to: string;
  from: string;
  levels?: CostLevel[];
  apiKey?: string;
};

type Logger = (event: string, payload: Record<string, unknown>) => void;

const TTL_SECONDS = 60 * 60 * 24 * 35; // 35 days
const ALERT_COOLDOWN_SECONDS = 60 * 60; // 60 minutes
const DEFAULT_BUDGET_USD = 10;
const WARNING_THRESHOLD = 80;
const CRITICAL_THRESHOLD = 95;

let cachedRedis: Redis | null = null;
let redisPromise: Promise<Redis | null> | null = null;

function parseNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function buildMonthKey(now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `chat:cost:${year}-${month}`;
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

async function maybeSendCostEmail(state: RuntimeCostState, config: CostAlertEmailConfig, logger?: Logger): Promise<void> {
  const allowedLevels = config.levels ?? ['warning', 'critical', 'exceeded'];
  if (!allowedLevels.includes(state.level)) {
    return;
  }
  const apiKey = config.apiKey ?? process.env.RESEND_API_KEY;
  if (!apiKey || !config.to || !config.from) {
    return;
  }

  const subject = `[Portfolio Chat] Cost Alert: ${state.level.toUpperCase()} - $${state.spendUsd.toFixed(2)}/${state.budgetUsd.toFixed(2)}`;
  const body = [
    'Portfolio Chat Runtime Cost Alert',
    '================================',
    '',
    `Level: ${state.level.toUpperCase()}`,
    `Current Spend: $${state.spendUsd.toFixed(4)}`,
    `Monthly Budget: $${state.budgetUsd.toFixed(2)}`,
    `Percent Used: ${state.percentUsed.toFixed(1)}%`,
    `Remaining: $${state.remainingUsd.toFixed(4)}`,
    `Estimated Turns Remaining: ${state.estimatedTurnsRemaining}`,
    '',
    `Timestamp: ${state.updatedAt}`,
    '',
    '---',
    'This is an automated alert from your Portfolio Chat runtime.',
  ].join('\n');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.from,
        to: config.to,
        subject,
        text: body,
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Resend email failed (${response.status}): ${text}`);
    }
    logger?.('chat.cost.alert_email', { level: state.level, to: config.to });
  } catch (error) {
    logger?.('chat.cost.alert_email_error', { level: state.level, error: String(error) });
  }
}

async function maybeSendAlert(
  redis: Redis,
  state: RuntimeCostState,
  logger?: Logger,
  emailConfig?: CostAlertEmailConfig
): Promise<void> {
  if (state.level === 'ok') {
    return;
  }
  const alertKey = `${state.monthKey}:alert:${state.level}`;
  const shouldAlert = await redis.set(alertKey, state.updatedAt, { nx: true, ex: ALERT_COOLDOWN_SECONDS });
  if (shouldAlert !== 'OK') {
    return;
  }

  logger?.('chat.cost.alert', {
    level: state.level,
    spendUsd: state.spendUsd,
    budgetUsd: state.budgetUsd,
    percentUsed: state.percentUsed,
    remainingUsd: state.remainingUsd,
    turnCount: state.turnCount,
  });

  if (emailConfig) {
    await maybeSendCostEmail(state, emailConfig, logger);
  }
}

export async function getRuntimeCostRedis(): Promise<Redis | null> {
  if (cachedRedis) return cachedRedis;
  if (redisPromise) return redisPromise;
  redisPromise = (async () => {
    try {
      const [url, token] = await Promise.all([
        resolveSecretValue('UPSTASH_REDIS_REST_URL', { scope: 'repo' }),
        resolveSecretValue('UPSTASH_REDIS_REST_TOKEN', { scope: 'repo' }),
      ]);
      if (!url || !token) {
        console.warn('[runtime-cost] Redis unavailable (missing credentials)');
        return null;
      }
      cachedRedis = new Redis({ url, token });
      return cachedRedis;
    } catch (error) {
      console.warn('[runtime-cost] Failed to initialize Redis', error);
      return null;
    } finally {
      redisPromise = null;
    }
  })();
  return redisPromise;
}

function resolveBudget(): number {
  const parsed = Number.parseFloat(process.env.CHAT_MONTHLY_BUDGET_USD ?? '');
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_BUDGET_USD;
}

export async function getRuntimeCostState(redis: Redis): Promise<RuntimeCostState> {
  const monthKey = buildMonthKey();
  const [spend, turns] = await Promise.all([redis.hget(monthKey, 'usd'), redis.hget(monthKey, 'turns')]);
  const spendUsd = parseNumber(spend);
  const turnCount = Math.max(0, Math.floor(parseNumber(turns)));
  return evaluateCostState(spendUsd, turnCount, resolveBudget());
}

export function resolveCostAlertEmailConfig(): CostAlertEmailConfig | null {
  const to = process.env.CHAT_COST_ALERT_TO ?? process.env.OPENAI_COST_ALERT_EMAIL;
  const from = process.env.CHAT_COST_ALERT_FROM;
  if (!to || !from) {
    return null;
  }
  const levelsEnv = process.env.CHAT_COST_ALERT_LEVELS;
  const levels = levelsEnv
    ? levelsEnv
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry): entry is CostLevel => entry === 'warning' || entry === 'critical' || entry === 'exceeded')
    : undefined;
  return {
    to,
    from,
    levels: levels && levels.length ? levels : undefined,
    apiKey: process.env.RESEND_API_KEY,
  };
}

export async function recordRuntimeCost(
  redis: Redis,
  costUsd: number,
  logger?: Logger,
  emailConfig?: CostAlertEmailConfig
): Promise<RuntimeCostState> {
  const monthKey = buildMonthKey();
  const increment = Number.isFinite(costUsd) && costUsd > 0 ? costUsd : 0;

  const spendResult = await redis.hincrbyfloat(monthKey, 'usd', increment);
  const turnResult = await redis.hincrby(monthKey, 'turns', 1);
  await redis.expire(monthKey, TTL_SECONDS);

  const state = evaluateCostState(parseNumber(spendResult), Math.max(0, Math.floor(parseNumber(turnResult))), resolveBudget());
  await maybeSendAlert(redis, state, logger, emailConfig);
  return state;
}

export async function shouldThrottleForBudget(
  redis: Redis,
  logger?: Logger,
  emailConfig?: CostAlertEmailConfig
): Promise<RuntimeCostState> {
  const state = await getRuntimeCostState(redis);
  if (state.level === 'ok' || state.level === 'warning') {
    return state;
  }
  // Send alert on critical/exceeded even when just checking.
  await maybeSendAlert(redis, state, logger, emailConfig);
  return state;
}
