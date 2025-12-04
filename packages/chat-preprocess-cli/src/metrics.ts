import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { estimateCostUsd, parseUsage } from '@portfolio/chat-contract';

export type LlmCallMeta = Record<string, unknown>;

type MetricsEntry = {
  stage: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsdEstimate: number | null;
  durationMs: number;
  status: 'ok' | 'error';
  error?: string;
  meta?: LlmCallMeta;
  startedAt: string;
};

type MetricsStageTotals = {
  stage: string;
  calls: number;
  ok: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsdEstimate: number;
  models: string[];
};

export type MetricsSummary = {
  runId: string;
  ownerId: string;
  startedAt: string;
  finishedAt: string;
  totals: {
    calls: number;
    ok: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsdEstimate: number;
    withCost: number;
  };
  stageTotals: Record<string, MetricsStageTotals>;
};

function buildRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

type WrapOptions = {
  stage: string;
  model?: string;
  meta?: LlmCallMeta;
};

export class PreprocessMetrics {
  private readonly outputDir: string;
  private readonly ownerId: string;
  private readonly runId: string;
  private readonly startedAt: string;
  private finishedAt: string | null = null;
  private entries: MetricsEntry[] = [];

  constructor(options: { outputDir: string; ownerId?: string; runId?: string }) {
    this.outputDir = options.outputDir;
    this.ownerId = options.ownerId || process.env.CHAT_OWNER_ID || 'portfolio-owner';
    this.runId = options.runId ?? buildRunId();
    this.startedAt = new Date().toISOString();
  }

  getRunId(): string {
    return this.runId;
  }

  async wrapLlm<T>(options: WrapOptions, fn: () => Promise<T>): Promise<T> {
    const started = performance.now();
    const startedAt = new Date().toISOString();
    try {
      const result = await fn();
      const usage = parseUsage((result as { usage?: unknown })?.usage ?? (result as unknown), { allowZero: true }) ?? {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      };
      this.entries.push({
        stage: options.stage,
        model: options.model ?? 'unknown',
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        costUsdEstimate: estimateCostUsd(options.model, usage),
        durationMs: performance.now() - started,
        status: 'ok',
        meta: options.meta,
        startedAt,
      });
      return result;
    } catch (error) {
      this.entries.push({
        stage: options.stage,
        model: options.model ?? 'unknown',
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsdEstimate: null,
        durationMs: performance.now() - started,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        meta: options.meta,
        startedAt,
      });
      throw error;
    }
  }

  getSummary(finishedAt = new Date().toISOString()): MetricsSummary {
    const totals = {
      calls: this.entries.length,
      ok: this.entries.filter((entry) => entry.status === 'ok').length,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsdEstimate: 0,
      withCost: 0,
    };
    const stageTotals: Record<string, MetricsStageTotals> = {};

    for (const entry of this.entries) {
      totals.inputTokens += entry.inputTokens;
      totals.outputTokens += entry.outputTokens;
      totals.totalTokens += entry.totalTokens;
      if (entry.costUsdEstimate !== null) {
        totals.costUsdEstimate += entry.costUsdEstimate;
        totals.withCost += 1;
      }
      const stageKey = entry.stage || 'unknown';
      if (!stageTotals[stageKey]) {
        stageTotals[stageKey] = {
          stage: stageKey,
          calls: 0,
          ok: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUsdEstimate: 0,
          models: [],
        };
      }
      const bucket = stageTotals[stageKey];
      bucket.calls += 1;
      if (entry.status === 'ok') {
        bucket.ok += 1;
      }
      bucket.inputTokens += entry.inputTokens;
      bucket.outputTokens += entry.outputTokens;
      bucket.totalTokens += entry.totalTokens;
      if (entry.costUsdEstimate !== null) {
        bucket.costUsdEstimate += entry.costUsdEstimate;
      }
      if (entry.model && !bucket.models.includes(entry.model)) {
        bucket.models.push(entry.model);
      }
    }

    return {
      runId: this.runId,
      ownerId: this.ownerId,
      startedAt: this.startedAt,
      finishedAt,
      totals: {
        ...totals,
        costUsdEstimate: Number(totals.costUsdEstimate.toFixed(6)),
      },
      stageTotals,
    };
  }

  async flush(): Promise<{ filePath: string; summary: MetricsSummary }> {
    const finishedAt = new Date().toISOString();
    this.finishedAt = finishedAt;
    const summary = this.getSummary(finishedAt);
    const payload = {
      ...summary,
      calls: this.entries,
    };
    await fs.mkdir(this.outputDir, { recursive: true });
    const filePath = path.join(this.outputDir, `preprocess-${this.runId}.json`);
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    return { filePath, summary };
  }

  printSummary(filePath?: string) {
    const summary = this.getSummary(this.finishedAt ?? new Date().toISOString());
    const totalCost = summary.totals.costUsdEstimate.toFixed(4);
    console.log(
      `\n📊 Preprocess metrics (${summary.runId}) — ${summary.totals.calls} calls, ` +
        `${summary.totals.totalTokens} toks, ~$${totalCost}`
    );
    const stages = Object.values(summary.stageTotals);
    for (const stage of stages) {
      const modelsLabel = stage.models.length ? ` [${stage.models.join(', ')}]` : '';
      console.log(
        `  • ${stage.stage}: ${stage.calls} calls, ${stage.totalTokens} toks, ~$${stage.costUsdEstimate.toFixed(4)}${modelsLabel}`
      );
    }
    if (filePath) {
      console.log(`  • wrote metrics: ${filePath}`);
    }
  }
}
