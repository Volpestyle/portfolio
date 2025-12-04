import { CloudWatchClient, PutMetricDataCommand, StandardUnit, type MetricDatum } from '@aws-sdk/client-cloudwatch';
import { calculateCost, DEFAULT_COST_DECIMAL_PLACES, getNormalizedPricing, parseUsage, resolveModelKey } from '@portfolio/chat-contract';

const ENABLED = process.env.OPENAI_COST_METRICS_ENABLED === 'true';
const NAMESPACE = process.env.OPENAI_COST_METRIC_NAMESPACE || 'PortfolioChat/OpenAI';
const METRIC_NAME = process.env.OPENAI_COST_METRIC_NAME || 'EstimatedCost';
const MODEL_DIMENSION_NAME = 'Model';

let cwClient: CloudWatchClient | null = null;
let loggedPublishFailure = false;

function getCloudWatchClient(): CloudWatchClient {
  cwClient ??= new CloudWatchClient({});
  return cwClient;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function recordOpenAICostFromUsage(payload: unknown) {
  if (!ENABLED) return;

  const payloadRecord = isRecord(payload) ? payload : null;
  const model = typeof payloadRecord?.model === 'string' ? payloadRecord.model : undefined;
  const usageCandidate = payloadRecord?.usage ?? payload;

  const parsed = parseUsage(usageCandidate);
  if (!parsed) return;

  const resolvedModelKey = resolveModelKey(model);
  const pricing = getNormalizedPricing(resolvedModelKey ?? model);
  if (!pricing) {
    console.warn(`No pricing found for model "${model ?? 'unknown'}". Skipping cost metric publish until MODEL_PRICING is updated.`);
    return;
  }

  const cost = calculateCost(parsed, pricing);

  if (!Number.isFinite(cost) || cost <= 0) {
    return;
  }

  try {
    const client = getCloudWatchClient();
    const value = Number(cost.toFixed(DEFAULT_COST_DECIMAL_PLACES));
    const metricData: MetricDatum[] = [
      {
        MetricName: METRIC_NAME,
        Value: value,
        Unit: StandardUnit.None,
      },
    ];

  const modelDimensionValue = resolvedModelKey ?? model ?? 'unknown';
  if (modelDimensionValue) {
    metricData.push({
      MetricName: METRIC_NAME,
      Value: value,
      Unit: StandardUnit.None,
      Dimensions: [
        {
          Name: MODEL_DIMENSION_NAME,
          Value: modelDimensionValue,
        },
      ],
    });
  }

    await client.send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: metricData,
      })
    );
  } catch (error) {
    if (!loggedPublishFailure) {
      loggedPublishFailure = true;
      console.warn('Failed to publish OpenAI cost metric (suppressing future logs):', error);
    }
  }
}
