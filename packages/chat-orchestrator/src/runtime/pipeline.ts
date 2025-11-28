import type {
  ChatRequestMessage,
  EvidenceItem,
  EvidenceSummary,
  RetrievalPlan,
  AnswerPayload,
  EvidenceUiHints,
  ExperienceScope,
  ResumeFacet,
  UiPayload,
  PersonaSummary,
  RetrievalSummary,
  ReasoningTrace,
  PartialReasoningTrace,
  ReasoningStage,
  ReasoningTraceError,
  OwnerConfig,
  ModelConfig,
  TokenUsage,
  ChatStreamError,
  UiHintValidationWarning,
  ReasoningEffort,
} from '@portfolio/chat-contract';
import {
  DEFAULT_CHAT_HISTORY_LIMIT,
  AnswerPayloadSchema,
  ANSWER_LENGTH_VALUES,
  EvidenceSummarySchema,
  INTENT_VALUES,
  RESUME_FACET_VALUES,
  UI_TARGET_VALUES,
  RETRIEVAL_REQUEST_TOPK_MAX,
  PlannerLLMOutputSchema,
  deriveFromIntent as deriveFromIntentContract,
  parseUsage,
  estimateCostUsd,
  FALLBACK_NORMALIZED_PRICING,
} from '@portfolio/chat-contract';
import type { PlannerLLMOutput } from '@portfolio/chat-contract';
import type OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { ResponseFormatTextJSONSchemaConfig } from 'openai/resources/responses/responses';
import type { Reasoning } from 'openai/resources/shared';
import { performance } from 'node:perf_hooks';
import { inspect } from 'node:util';
import { getEncoding } from 'js-tiktoken';
import { z } from 'zod';
import { answerSystemPrompt, evidenceSystemPrompt, plannerSystemPrompt } from '../pipelinePrompts';
import {
  type AwardDoc,
  type EducationDoc,
  type ExperienceDoc,
  type ProfileDoc,
  type ProjectDoc,
  type RetrievalDrivers,
  type RetrievalResult,
  type ResumeDoc,
  type SkillDoc,
} from './retrieval';

type RetrievalCache = {
  projects: Map<string, ProjectDoc[]>;
  resume: Map<string, ResumeDoc[]>;
  profile?: Map<string, ProfileDoc | null>;
};

type ExecutedRetrievalResult = {
  result: RetrievalResult;
  summaries: RetrievalSummary[];
};

type AttachmentPayload = {
  type: 'project' | 'resume';
  id: string;
  data: unknown;
};

export type ChatbotResponse = {
  message: string;
  ui: UiPayload;
  reasoningTrace?: ReasoningTrace;
  answerThoughts?: string[];
  attachments?: AttachmentPayload[];
  truncationApplied?: boolean;
  usage?: StageUsage[];
  totalCostUsd?: number;
  error?: ChatStreamError;
};

export type HowIAnsweredSummary = {
  totalEvidence: number;
  projectCount: number;
  resumeCount: number;
  profileCount: number;
};

export type IdentityContext = {
  fullName?: string;
  headline?: string;
  location?: string;
  shortAbout?: string;
};

export type ChatRuntimeOptions = {
  owner?: OwnerConfig;
  ownerId?: string;
  modelConfig?: Partial<ModelConfig>;
  tokenLimits?: {
    planner?: number;
    evidence?: number;
    answer?: number;
  };
  persona?: PersonaSummary;
  identityContext?: IdentityContext;
  logger?: (event: string, payload: Record<string, unknown>) => void;
};

export type PipelineStage = 'planner' | 'retrieval' | 'evidence' | 'answer';
export type StageStatus = 'start' | 'complete';
export type StageMeta = {
  intent?: RetrievalPlan['intent'];
  topic?: RetrievalPlan['topic'];
  docsFound?: number;
  sources?: RetrievalSummary['source'][];
  highLevelAnswer?: EvidenceSummary['highLevelAnswer'];
  evidenceCount?: number;
  tokenCount?: number;
};

export type RunChatPipelineOptions = {
  onAnswerToken?: (delta: string) => void;
  abortSignal?: AbortSignal;
  softTimeoutMs?: number;
  onReasoningUpdate?: (stage: ReasoningStage, trace: PartialReasoningTrace) => void;
  ownerId?: string;
  reasoningEnabled?: boolean;
  onStageEvent?: (stage: PipelineStage, status: StageStatus, meta?: StageMeta, durationMs?: number) => void;
  onUiEvent?: (ui: UiPayload) => void;
};

export type StageUsage = {
  stage: PipelineStage | string;
  model: string;
  usage: TokenUsage;
  costUsd?: number;
};

type JsonResponseArgs<T> = {
  client: OpenAI;
  model: string;
  systemPrompt: string;
  userContent: string;
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  maxAttempts?: number;
  throwOnFailure?: boolean;
  logger?: ChatRuntimeOptions['logger'];
  usageStage?: string;
  signal?: AbortSignal;
  responseFormatName?: string;
  maxTokens?: number;
  onUsage?: (stage: string, model: string, usage: unknown) => void;
  reasoning?: Reasoning;
};

const DEFAULT_MAX_CONTEXT = DEFAULT_CHAT_HISTORY_LIMIT;
const SLIDING_WINDOW_CONFIG = {
  maxConversationTokens: 8000,
  minRecentTurns: 3,
  maxUserMessageTokens: 500,
};
const MAX_TOPK = RETRIEVAL_REQUEST_TOPK_MAX;
const MAX_ENUMERATION_DOCS = 50;
const MIN_PLAN_TOPK = 3;
const EVIDENCE_TOPK_CAP = 10;
const MAX_BODY_SNIPPET_CHARS = 480;
const PROJECT_BODY_SNIPPET_COUNT = 4;
const EXPERIENCE_BODY_SNIPPET_COUNT = 4;
const EVIDENCE_PROJECT_LIMIT = 6;
const EVIDENCE_EXPERIENCE_LIMIT = 6;
const EVIDENCE_EDUCATION_LIMIT = 4;
const EVIDENCE_AWARD_LIMIT = 4;
const EVIDENCE_SKILL_LIMIT = 4;
const TOTAL_EVIDENCE_DOC_LIMIT = 12;
const MAX_SELECTED_EVIDENCE = 6;
const MAX_DISPLAY_ITEMS = 10;
const ZERO_EVIDENCE_BANNER = 'I could not find any matching portfolio evidence for that question.';

function extractResponseOutputText(response: { output_text?: string; output?: unknown[] } | null | undefined): string {
  if (!response) return '';
  if (typeof response.output_text === 'string' && response.output_text.trim().length) {
    return response.output_text.trim();
  }
  const parts: string[] = [];
  const outputItems = Array.isArray(response.output) ? (response.output as Array<{ type?: string; content?: unknown[] }>) : [];
  for (const item of outputItems) {
    if (!item || typeof item !== 'object') continue;
    const content = Array.isArray((item as { content?: unknown[] }).content)
      ? ((item as { content?: unknown[] }).content as Array<{ type?: string; text?: string }>)
      : [];
    for (const chunk of content) {
      if (
        chunk &&
        typeof chunk === 'object' &&
        (chunk as { type?: string }).type === 'output_text' &&
        typeof (chunk as { text?: string }).text === 'string'
      ) {
        parts.push((chunk as { text?: string }).text as string);
      }
    }
  }
  return parts.join('\n').trim();
}

function extractResponseParsedContent(response: { output?: unknown[] } | null | undefined): unknown {
  if (!response) return undefined;
  const outputItems = Array.isArray(response.output) ? (response.output as Array<Record<string, unknown>>) : [];
  for (const item of outputItems) {
    if (!item || typeof item !== 'object') continue;
    if (Object.prototype.hasOwnProperty.call(item, 'parsed') && (item as { parsed?: unknown }).parsed !== undefined) {
      return (item as { parsed?: unknown }).parsed;
    }
    const content = Array.isArray(item.content) ? (item.content as Array<Record<string, unknown>>) : [];
    for (const chunk of content) {
      if (!chunk || typeof chunk !== 'object') continue;
      if (Object.prototype.hasOwnProperty.call(chunk, 'parsed') && (chunk as { parsed?: unknown }).parsed !== undefined) {
        return (chunk as { parsed?: unknown }).parsed;
      }
    }
  }
  return undefined;
}

function extractFirstJsonBlock(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < raw.length; i += 1) {
    const char = raw[i]!;
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(start, i + 1);
      }
    }
  }
  return null;
}

const DEFAULT_OWNER_IDENTITY = {
  ownerName: 'Portfolio Owner',
  domainLabel: 'portfolio owner',
};

export function applyOwnerTemplate(prompt: string, owner?: OwnerConfig): string {
  const ownerName = owner?.ownerName?.trim() || DEFAULT_OWNER_IDENTITY.ownerName;
  const domainLabel = owner?.domainLabel?.trim() || DEFAULT_OWNER_IDENTITY.domainLabel;
  return prompt.replace(/{{OWNER_NAME}}/g, ownerName).replace(/{{DOMAIN_LABEL}}/g, domainLabel);
}

export function buildPlannerSystemPrompt(owner?: OwnerConfig): string {
  return applyOwnerTemplate(plannerSystemPrompt, owner);
}

export function buildEvidenceSystemPrompt(owner?: OwnerConfig): string {
  return applyOwnerTemplate(evidenceSystemPrompt, owner);
}

function extractUserText(messages: ChatRequestMessage[]): string {
  const reversed = [...messages].reverse();
  const latest = reversed.find((msg) => msg.role === 'user');
  return latest?.content ?? '';
}

function buildContextSnippet(messages: ChatRequestMessage[]): string {
  return messages
    .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n')
    .trim();
}

type ConversationTurn = {
  user: ChatRequestMessage;
  assistant?: ChatRequestMessage;
  estimatedTokens: number;
};

type TruncationResult = {
  messages: ChatRequestMessage[];
  truncated: boolean;
  droppedTurns: number;
  retainedTurns: number;
  totalTokens: number;
};

class MessageTooLongError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MessageTooLongError';
  }
}

// Lazy-loaded tiktoken encoder (o200k_base for GPT-5 family)
let _encoder: ReturnType<typeof getEncoding> | null = null;

function getEncoder(): ReturnType<typeof getEncoding> {
  if (!_encoder) {
    // GPT-5, GPT-4o, o1, o3, o4-mini all use o200k_base
    _encoder = getEncoding('o200k_base');
  }
  return _encoder;
}

function countTokens(text: string): number {
  const encoder = getEncoder();
  return encoder.encode(text ?? '').length;
}

function groupIntoTurns(messages: ChatRequestMessage[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  let currentTurn: Partial<ConversationTurn> = {};

  const pushTurn = () => {
    if (!currentTurn.user) return;
    const assistant = currentTurn.assistant;
    const estimatedTokens =
      countTokens(currentTurn.user.content) + (assistant ? countTokens(assistant.content) : 0);
    turns.push({
      user: currentTurn.user,
      assistant,
      estimatedTokens,
    });
    currentTurn = {};
  };

  for (const msg of messages) {
    if (msg.role === 'user') {
      pushTurn();
      currentTurn = { user: msg };
    } else if (msg.role === 'assistant') {
      currentTurn.assistant = msg;
      if (currentTurn.user) {
        pushTurn();
      }
    }
  }

  pushTurn();
  return turns;
}

function applySlidingWindow(
  messages: ChatRequestMessage[],
  config: typeof SLIDING_WINDOW_CONFIG = SLIDING_WINDOW_CONFIG
): TruncationResult {
  const turns = groupIntoTurns(messages);
  const latestUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  if (latestUserMessage) {
    const userTokens = countTokens(latestUserMessage.content);
    if (userTokens > config.maxUserMessageTokens) {
      throw new MessageTooLongError(
        `Your message is too long (${userTokens} tokens). Please keep questions under ${config.maxUserMessageTokens} tokens.`
      );
    }
  }

  const keptTurns: ConversationTurn[] = [];
  let totalTokens = 0;

  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i]!;
    const newTotal = totalTokens + turn.estimatedTokens;
    const isRecentTurn = keptTurns.length < config.minRecentTurns;

    if (isRecentTurn || newTotal <= config.maxConversationTokens) {
      keptTurns.unshift(turn);
      totalTokens = newTotal;
    } else {
      break;
    }
  }

  const truncatedMessages = keptTurns.flatMap((turn) => [turn.user, turn.assistant].filter(Boolean)) as ChatRequestMessage[];
  const droppedTurns = Math.max(0, turns.length - keptTurns.length);

  return {
    messages: truncatedMessages,
    truncated: droppedTurns > 0,
    droppedTurns,
    retainedTurns: keptTurns.length,
    totalTokens,
  };
}

function formatLogValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'symbol') {
    return value.toString();
  }
  if (value instanceof Error) {
    const summary = [value.name, value.message].filter(Boolean).join(': ') || 'Error';
    const stack = typeof value.stack === 'string' ? value.stack : '';
    const extraKeys = Object.keys(value).filter((key) => key !== 'name' && key !== 'message' && key !== 'stack');
    const errorRecord = value as unknown as Record<string, unknown>;
    const extras =
      extraKeys.length > 0
        ? Object.fromEntries(extraKeys.map((key) => [key, errorRecord[key]]))
        : null;
    const extrasText = extras ? `\nextra: ${JSON.stringify(extras)}` : '';
    if (stack) {
      return stack.includes(summary) ? `${stack}${extrasText}` : `${summary}\n${stack}${extrasText}`;
    }
    return `${summary}${extrasText}`;
  }
  try {
    return JSON.stringify(
      value,
      (_key, val) => {
        if (typeof val === 'bigint') {
          return val.toString();
        }
        if (val instanceof Error) {
          return {
            name: val.name,
            message: val.message,
            stack: val.stack,
          };
        }
        return val;
      },
      2
    );
  } catch {
    try {
      return inspect(value, { depth: 5, breakLength: 140 });
    } catch {
      return String(value);
    }
  }
}

function normalizeSnippet(text?: string | null, maxChars = MAX_BODY_SNIPPET_CHARS): string | undefined {
  if (!text) return undefined;
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  return normalized.length > maxChars ? normalized.slice(0, maxChars) : normalized;
}

function clampTopK(value: unknown, max = MAX_TOPK): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.min(max, Math.floor(value)));
  }
  return undefined;
}

function clampPlanTopK(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const rounded = Math.floor(value);
    return Math.max(MIN_PLAN_TOPK, Math.min(MAX_TOPK, rounded));
  }
  return MIN_PLAN_TOPK;
}

function resolveModelConfig(options?: ChatRuntimeOptions): ModelConfig {
  const normalizeModel = (value?: string) => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  };

  const answerModel = normalizeModel(options?.modelConfig?.answerModel);
  const plannerModel = normalizeModel(options?.modelConfig?.plannerModel) ?? answerModel;
  const evidenceModel = normalizeModel(options?.modelConfig?.evidenceModel) ?? answerModel;
  const evidenceModelDeepDive = normalizeModel(options?.modelConfig?.evidenceModelDeepDive) ?? evidenceModel;
  const embeddingModel = normalizeModel(options?.modelConfig?.embeddingModel);

  const missing = [
    answerModel ? null : 'answerModel (models.answerModel)',
    plannerModel ? null : 'plannerModel (models.planner)',
    evidenceModel ? null : 'evidenceModel (models.evidenceModel)',
    embeddingModel ? null : 'embeddingModel (models.embedding)',
  ].filter((item): item is string => Boolean(item));

  if (missing.length) {
    throw new Error(
      `Chat runtime requires modelConfig values. Missing: ${missing.join(
        ', '
      )}. Provide them via chat.config.yml (models.planner/evidenceModel/answerModel/embedding) or ensure chat-preprocess.config.yml declares the embedding model.`
    );
  }

  return {
    plannerModel: plannerModel!,
    evidenceModel: evidenceModel!,
    evidenceModelDeepDive: evidenceModelDeepDive ?? evidenceModel!,
    answerModel: answerModel!,
    embeddingModel: embeddingModel!,
  };
}

function resolveReasoningParams(model: string, allowReasoning: boolean, effort?: ReasoningEffort): Reasoning | undefined {
  if (!allowReasoning || !effort) {
    return undefined;
  }
  const normalizedModel = model.trim().toLowerCase();
  const isReasoningModel = normalizedModel.startsWith('gpt-5') || normalizedModel.startsWith('o');
  if (!isReasoningModel) {
    return undefined;
  }
  // gpt-5-pro only supports high reasoning effort; skip custom effort unless explicitly compatible.
  if (normalizedModel.includes('pro') && effort !== 'high') {
    return undefined;
  }
  return { effort };
}

export function shouldUseEvidenceDeepDive(plan: RetrievalPlan, retrieved: RetrievalResult): boolean {
  // Deep-dive when the query is broad/uncertain or when a large doc set needs tighter reasoning.
  const docCount =
    (retrieved.projects?.length ?? 0) +
    (retrieved.experiences?.length ?? 0) +
    (retrieved.education?.length ?? 0) +
    (retrieved.awards?.length ?? 0) +
    (retrieved.skills?.length ?? 0);
  const topicLength = plan.topic?.trim().length ?? 0;
  const lowConfidenceLongTopic = plan.plannerConfidence < 0.45 && topicLength >= 18;
  const highDocVolume = docCount >= 12 || (plan.enumerateAllRelevant && docCount >= 8);
  return plan.intent !== 'meta' && (lowConfidenceLongTopic || highDocVolume);
}

function selectEvidenceModel(plan: RetrievalPlan, retrieved: RetrievalResult, modelConfig: ModelConfig): string {
  if (shouldUseEvidenceDeepDive(plan, retrieved) && modelConfig.evidenceModelDeepDive) {
    return modelConfig.evidenceModelDeepDive;
  }
  return modelConfig.evidenceModel;
}

type DerivedBehavior = {
  answerMode: RetrievalPlan['answerMode'];
  enumerateAllRelevant: boolean;
};

/**
 * Derives answerMode and enumerateAllRelevant from intent.
 * Delegates to the contract's deriveFromIntent function (per spec §4.2).
 */
function deriveFromIntent(intent: RetrievalPlan['intent']): DerivedBehavior {
  return deriveFromIntentContract(intent);
}

export type RetrievalFocus = 'resume' | 'projects' | 'mixed';

export function inferRetrievalFocus(
  retrievalRequests: RetrievalPlan['retrievalRequests'],
  intent: RetrievalPlan['intent'],
  experienceScope?: ExperienceScope | null,
  resumeFacets?: ResumeFacet[] | null
): RetrievalFocus {
  if (intent === 'meta') return 'mixed';
  const sources = new Set(
    (Array.isArray(retrievalRequests) ? retrievalRequests : [])
      .map((req) => req?.source)
      .filter((source): source is 'projects' | 'resume' => source === 'projects' || source === 'resume')
  );
  if (sources.has('projects') && sources.has('resume')) return 'mixed';
  if (sources.size === 1) {
    return sources.has('resume') ? 'resume' : 'projects';
  }

  const resumeFacetSet = new Set(resumeFacets ?? []);
  const hasResumeBias =
    experienceScope === 'employment_only' ||
    resumeFacetSet.has('experience') ||
    resumeFacetSet.has('skill');

  if (hasResumeBias) return 'resume';

  return 'mixed';
}

export function normalizeRetrievalPlan(plan: RetrievalPlan): RetrievalPlan {
  let intent = (INTENT_VALUES as readonly string[]).includes(plan.intent) ? plan.intent : 'describe';
  if (intent !== 'meta' && plan.enumerateAllRelevant) {
    intent = 'enumerate';
  }
  const derivedFromIntent = deriveFromIntent(intent);
  const topic = plan.topic?.trim() ?? null;
  const plannerConfidence =
    typeof plan.plannerConfidence === 'number' && Number.isFinite(plan.plannerConfidence)
      ? Math.max(0, Math.min(1, plan.plannerConfidence))
      : 0.5;
  const experienceScope =
    plan.experienceScope && plan.experienceScope !== null && (['employment_only', 'any_experience'] as const).includes(plan.experienceScope)
      ? plan.experienceScope
      : null;
  const enumerateAllRelevant =
    intent === 'meta'
      ? false
      : derivedFromIntent.enumerateAllRelevant || plan.enumerateAllRelevant === true;
  const answerMode = derivedFromIntent.answerMode;
  const answerLengthHint = (ANSWER_LENGTH_VALUES as readonly string[]).includes(plan.answerLengthHint)
    ? plan.answerLengthHint
    : 'medium';
  const resumeFacets = Array.isArray(plan.resumeFacets)
    ? plan.resumeFacets.filter((facet): facet is ResumeFacet =>
      (RESUME_FACET_VALUES as readonly string[]).includes(facet as ResumeFacet)
    )
    : [];
  const isUiTargetValid = (UI_TARGET_VALUES as readonly string[]).includes(plan.uiTarget ?? '');
  const uiTarget = isUiTargetValid ? plan.uiTarget : null;

  const normalizedRequests: RetrievalPlan['retrievalRequests'] = [];
  const seenKeys = new Set<string>();
  const plannerRequests = Array.isArray(plan.retrievalRequests) ? plan.retrievalRequests : [];

  // Respect explicit no-retrieval plans (planner may decide persona/history is enough).
  const allowMetaRequests = intent === 'meta' && plannerRequests.length > 0;
  if ((plannerRequests.length > 0 && intent !== 'meta') || allowMetaRequests) {
    for (const request of plannerRequests) {
      if (!request || typeof request !== 'object') continue;
      if (!(request.source === 'projects' || request.source === 'resume' || request.source === 'profile')) {
        continue;
      }
      // For meta/chit-chat, only honor profile lookups to keep behavior lightweight.
      if (intent === 'meta' && request.source !== 'profile') {
        continue;
      }

      const queryText = (request.queryText ?? '').trim();
      const dedupeKey = `${request.source}:${queryText.toLowerCase()}`;
      if (seenKeys.has(dedupeKey)) {
        continue;
      }
      seenKeys.add(dedupeKey);
      normalizedRequests.push({
        source: request.source,
        queryText,
        topK: clampPlanTopK(request.topK),
      });
    }
  }

  const topicFallback = topic ?? '';
  const ensureRequest = (source: 'projects' | 'resume') => {
    const queryText = topicFallback;
    const dedupeKey = `${source}:${queryText.toLowerCase()}`;
    if (seenKeys.has(dedupeKey)) {
      return;
    }
    seenKeys.add(dedupeKey);
    normalizedRequests.push({
      source,
      queryText,
      topK: MIN_PLAN_TOPK,
    });
  };

  const focus = inferRetrievalFocus(normalizedRequests, intent, experienceScope, resumeFacets);
  const hasSource = (source: 'projects' | 'resume') => normalizedRequests.some((req) => req.source === source);

  if (intent !== 'meta') {
    if (focus === 'resume' && !hasSource('resume')) {
      ensureRequest('resume');
    } else if (focus === 'projects' && !hasSource('projects')) {
      ensureRequest('projects');
    } else {
      if (!hasSource('projects')) ensureRequest('projects');
      if (!hasSource('resume')) ensureRequest('resume');
    }
  }

  return {
    ...plan,
    intent,
    topic,
    plannerConfidence,
    experienceScope,
    retrievalRequests: normalizedRequests,
    resumeFacets,
    uiTarget,
    answerMode,
    answerLengthHint,
    enumerateAllRelevant,
  };
}

type PlanNormalizationSource = 'planner' | 'cache';

type PlanAdjustment = {
  field: string;
  from: unknown;
  to: unknown;
};

function summarizeRetrievalRequests(requests: RetrievalPlan['retrievalRequests']): Array<Record<string, unknown>> {
  return requests.map((request) => ({
    source: request.source,
    queryText: request.queryText,
    topK: request.topK,
  }));
}

function buildPlanAdjustments(rawPlan: RetrievalPlan, normalizedPlan: RetrievalPlan): PlanAdjustment[] {
  const adjustments: PlanAdjustment[] = [];
  const comparableFields: (keyof RetrievalPlan)[] = [
    'intent',
    'topic',
    'plannerConfidence',
    'experienceScope',
    'answerMode',
    'answerLengthHint',
    'resumeFacets',
    'enumerateAllRelevant',
    'debugNotes',
    'uiTarget',
  ];
  for (const field of comparableFields) {
    const before = rawPlan[field];
    const after = normalizedPlan[field];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      adjustments.push({ field, from: before ?? null, to: after ?? null });
    }
  }
  const rawRequests = summarizeRetrievalRequests(rawPlan.retrievalRequests ?? []);
  const normalizedRequests = summarizeRetrievalRequests(normalizedPlan.retrievalRequests ?? []);
  if (JSON.stringify(rawRequests) !== JSON.stringify(normalizedRequests)) {
    adjustments.push({
      field: 'retrievalRequests',
      from: rawRequests,
      to: normalizedRequests,
    });
  }
  return adjustments;
}

function logPlanNormalization(
  rawPlan: RetrievalPlan,
  normalizedPlan: RetrievalPlan,
  logger: ChatRuntimeOptions['logger'],
  source: PlanNormalizationSource
): void {
  if (!logger) return;
  const adjustments = buildPlanAdjustments(rawPlan, normalizedPlan);
  const topKs = normalizedPlan.retrievalRequests.map((request) => request.topK);
  const stats = {
    requestCount: normalizedPlan.retrievalRequests.length,
    sources: normalizedPlan.retrievalRequests.reduce<Record<string, number>>((acc, request) => {
      acc[request.source] = (acc[request.source] ?? 0) + 1;
      return acc;
    }, {}),
    topKRange:
      topKs.length > 0
        ? {
          min: Math.min(...topKs),
          max: Math.max(...topKs),
        }
        : null,
  };
  logger('chat.pipeline.plan.normalize', {
    source,
    adjustments,
    stats,
    intent: normalizedPlan.intent,
    experienceScope: normalizedPlan.experienceScope ?? null,
    answerMode: normalizedPlan.answerMode,
    enumerateAllRelevant: normalizedPlan.enumerateAllRelevant,
    uiTarget: normalizedPlan.uiTarget ?? null,
  });
}
function resolveTopK(plan: RetrievalPlan, requestedTopK?: number, source?: RetrievalPlan['retrievalRequests'][number]['source']): {
  effectiveTopK: number;
  reason: string;
} {
  if (plan.enumerateAllRelevant) {
    const effectiveTopK = MAX_ENUMERATION_DOCS;
    return {
      effectiveTopK,
      reason: `enumerate${source ? `:${source}` : ''}`,
    };
  }
  const requested = clampTopK(requestedTopK, MAX_TOPK);
  const baseline = Math.min(requested ?? MAX_TOPK, EVIDENCE_TOPK_CAP);
  const confidence = plan.plannerConfidence;
  const topicLength = plan.topic?.trim().length ?? 0;
  const isVagueTopic = !plan.topic || topicLength < 8;
  const isConciseTopic = topicLength <= 18;

  let effectiveTopK = baseline;
  let reason = 'baseline';

  if (plan.intent === 'meta') {
    effectiveTopK = Math.min(baseline, 4);
    reason = 'meta';
  } else if (confidence < 0.35 || isVagueTopic) {
    effectiveTopK = baseline + 2;
    reason = confidence < 0.35 ? 'low_confidence' : 'vague_topic';
  } else if (confidence > 0.8 && !isVagueTopic && baseline > 4 && isConciseTopic) {
    effectiveTopK = baseline - 2;
    reason = 'high_confidence';
  }

  const clamped = Math.max(1, Math.min(Math.round(effectiveTopK), EVIDENCE_TOPK_CAP));
  return {
    effectiveTopK: clamped,
    reason: `${reason}${source ? `:${source}` : ''}`,
  };
}

async function runJsonResponse<T>({
  client,
  model,
  systemPrompt,
  userContent,
  schema,
  maxAttempts = 2,
  throwOnFailure = false,
  logger,
  usageStage,
  signal,
  responseFormatName,
  maxTokens,
  onUsage,
  reasoning,
}: JsonResponseArgs<T>): Promise<T> {
  let attempt = 0;
  let lastError: unknown = null;
  const responseFormat = zodResponseFormat(schema, responseFormatName ?? usageStage ?? 'json_payload');
  const responseFormatNameValue = responseFormatName ?? usageStage ?? 'json_payload';
  const responseFormatJsonSchema = (responseFormat as { json_schema?: Partial<ResponseFormatTextJSONSchemaConfig> & { schema?: Record<string, unknown> } }).json_schema;
  const jsonSchemaFormat: ResponseFormatTextJSONSchemaConfig = {
    type: 'json_schema',
    name: responseFormatJsonSchema?.name ?? responseFormatNameValue,
    schema: (responseFormatJsonSchema?.schema as Record<string, unknown>) ?? {},
    description: responseFormatJsonSchema?.description,
    strict: responseFormatJsonSchema?.strict ?? true,
  };
  const stageLabel = usageStage ?? 'json_response';

  while (attempt < maxAttempts) {
    attempt += 1;
    let response: Awaited<ReturnType<typeof client.responses.create>>;
    logger?.('chat.pipeline.model.request', {
      stage: stageLabel,
      model,
      attempt,
      reasoning: reasoning ?? null,
      maxTokens: maxTokens ?? null,
    });
    try {
      response = await client.responses.create(
        {
          model,
          stream: false,
          text: { format: jsonSchemaFormat },
          input: [
            { role: 'system', content: systemPrompt, type: 'message' },
            { role: 'user', content: userContent, type: 'message' },
          ],
          ...(typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0
            ? { max_output_tokens: Math.floor(maxTokens) }
            : {}),
          ...(reasoning ? { reasoning } : {}),
        },
        signal ? { signal } : undefined
      );
    } catch (error) {
      lastError = error;
      logger?.('chat.pipeline.model.error', { stage: stageLabel, model, error: formatLogValue(error), attempt });
      continue;
    }

    const usage = (response as { usage?: unknown })?.usage;
    if (usage) {
      logger?.('chat.pipeline.tokens', {
        stage: stageLabel,
        model,
        attempt,
        usage,
      });
      onUsage?.(stageLabel, model, usage);
    }

    const rawContent = extractResponseOutputText(response);
    const structuredCandidate = extractResponseParsedContent(response);
    logger?.('chat.pipeline.model.raw', { stage: stageLabel, model, raw: rawContent, attempt });

    let candidate = structuredCandidate;
    let parsedFrom: 'structured' | 'text' | undefined = typeof structuredCandidate !== 'undefined' ? 'structured' : undefined;

    if (typeof candidate === 'undefined') {
      const trimmedContent = typeof rawContent === 'string' ? rawContent.trim() : '';
      let parseError: unknown = null;
      if (trimmedContent.length > 0) {
        try {
          candidate = JSON.parse(trimmedContent);
          parsedFrom = 'text';
        } catch (initialError) {
          try {
            const fallback = extractFirstJsonBlock(trimmedContent);
            if (!fallback) {
              throw initialError;
            }
            candidate = JSON.parse(fallback);
            parsedFrom = 'text';
          } catch (error) {
            parseError = error;
          }
        }
      } else {
        parseError = new Error('json_parse_failure');
      }

      if (typeof candidate === 'undefined') {
        lastError = parseError;
        logger?.('chat.pipeline.model.parse_error', {
          stage: stageLabel,
          model,
          raw: typeof rawContent === 'string' ? rawContent.slice(0, 2000) : rawContent,
          error: formatLogValue(parseError ?? 'unknown'),
          attempt,
        });
        continue;
      }
    }

    const validated = schema.safeParse(candidate);
    if (!validated.success) {
      lastError = validated.error.issues;
      logger?.('chat.pipeline.model.validation_error', {
        stage: stageLabel,
        model,
        attempt,
        issues: validated.error.issues,
      });
      let candidatePreview: string | undefined;
      try {
        if (candidate === null) {
          candidatePreview = 'null';
        } else if (typeof candidate === 'object') {
          candidatePreview = JSON.stringify(candidate).slice(0, 2000);
        } else {
          candidatePreview = String(candidate).slice(0, 2000);
        }
      } catch {
        candidatePreview = '[unserializable]';
      }
      logger?.('chat.pipeline.model.raw_candidate', {
        stage: stageLabel,
        model,
        attempt,
        candidateSource: parsedFrom ?? 'unknown',
        candidateType: candidate === null ? 'null' : typeof candidate,
        candidatePreview,
        rawTextPreview: rawContent.slice(0, 2000),
      });
      continue;
    }
    return validated.data;
  }

  logger?.('chat.pipeline.model.fallback', { stage: stageLabel, model, lastError: formatLogValue(lastError ?? 'unknown') });
  if (throwOnFailure) {
    throw new Error(`chat_pipeline_model_failure:${model}`);
  }
  throw lastError instanceof Error ? lastError : new Error(formatLogValue(lastError ?? 'unknown'));
}

async function runStreamingJsonResponse<T>({
  client,
  model,
  systemPrompt,
  userContent,
  schema,
  maxAttempts = 2,
  throwOnFailure = false,
  logger,
  usageStage,
  signal,
  responseFormatName,
  maxTokens,
  onTextDelta,
  onUsage,
  reasoning,
}: JsonResponseArgs<T> & { onTextDelta?: (delta: string) => void; onUsage?: (stage: string, model: string, usage: unknown) => void }): Promise<T> {
  let attempt = 0;
  let lastError: unknown = null;
  const responseFormat = zodResponseFormat(schema, responseFormatName ?? usageStage ?? 'json_payload');
  const responseFormatNameValue = responseFormatName ?? usageStage ?? 'json_payload';
  const responseFormatJsonSchema = (responseFormat as { json_schema?: Partial<ResponseFormatTextJSONSchemaConfig> & { schema?: Record<string, unknown> } }).json_schema;
  const jsonSchemaFormat: ResponseFormatTextJSONSchemaConfig = {
    type: 'json_schema',
    name: responseFormatJsonSchema?.name ?? responseFormatNameValue,
    schema: (responseFormatJsonSchema?.schema as Record<string, unknown>) ?? {},
    description: responseFormatJsonSchema?.description,
    strict: responseFormatJsonSchema?.strict ?? true,
  };
  const stageLabel = usageStage ?? 'json_response';
  // Normalize JSON escape sequences so literal `\n` equals actual newline
  const normalizeEscapes = (s: string) =>
    s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r').replace(/\\\\/g, '\\');
  const sharedPrefixLength = (a: string, b: string) => {
    const max = Math.min(a.length, b.length);
    let idx = 0;
    while (idx < max && a[idx] === b[idx]) {
      idx += 1;
    }
    return idx;
  };
  const sanitizeMessageSnapshot = (nextMessage: string, previousMessage: string): string => {
    const trimmedNext = typeof nextMessage === 'string' ? nextMessage.trimEnd() : '';
    const trimmedPrev = previousMessage.trimEnd();
    if (!trimmedPrev || trimmedNext.length <= trimmedPrev.length) {
      return trimmedNext;
    }
    if (trimmedNext.endsWith(trimmedPrev)) {
      const leading = trimmedNext.slice(0, trimmedNext.length - trimmedPrev.length).trimEnd();
      if (leading === trimmedPrev) {
        return trimmedPrev;
      }
    }
    return trimmedNext;
  };
  const extractMessageFromPartialJson = (raw: string): string | null => {
    const match = raw.match(/"message"\s*:\s*"([\s\S]*?)"/);
    if (!match) {
      return null;
    }
    const candidate = match[1];
    try {
      return JSON.parse(`"${candidate.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
    } catch {
      return candidate;
    }
  };

  while (attempt < maxAttempts) {
    attempt += 1;
    let stream: ReturnType<typeof client.responses.stream> | null = null;
    let abortListener: (() => void) | null = null;
    let emitMessageDelta: ((message: string | null | undefined) => void) | null = null;
    let streamedText = '';
    let streamedParsed: unknown;
    let lastEmittedMessage = '';
    let lastStreamedMessage = '';
    logger?.('chat.pipeline.model.request', {
      stage: stageLabel,
      model,
      attempt,
      reasoning: reasoning ?? null,
      maxTokens: maxTokens ?? null,
      streaming: true,
    });
    try {
      stream = client.responses.stream(
        {
          model,
          stream: true,
          text: { format: jsonSchemaFormat },
          input: [
            { role: 'system', content: systemPrompt, type: 'message' },
            { role: 'user', content: userContent, type: 'message' },
          ],
          ...(typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0
            ? { max_output_tokens: Math.floor(maxTokens) }
            : {}),
          ...(reasoning ? { reasoning } : {}),
        },
        signal ? { signal } : undefined
      );

      if (signal) {
        if (signal.aborted) {
          stream.abort();
          throw signal.reason ?? new Error('aborted');
        }
        abortListener = () => {
          try {
            stream?.abort();
          } catch (err) {
            logger?.('chat.pipeline.error', { stage: `${stageLabel}_abort`, model, error: formatLogValue(err) });
          }
        };
        signal.addEventListener('abort', abortListener, { once: true });
      }

      if (onTextDelta) {
        emitMessageDelta = (message: string | null | undefined) => {
          if (!onTextDelta || typeof message !== 'string' || !message.trim()) {
            return;
          }
          const sanitizedMessage = sanitizeMessageSnapshot(message, lastEmittedMessage);
          if (!sanitizedMessage) {
            return;
          }
          if (sanitizedMessage.length < lastEmittedMessage.length && lastEmittedMessage.startsWith(sanitizedMessage)) {
            return;
          }
          const prefix = sharedPrefixLength(sanitizedMessage, lastEmittedMessage);
          const delta = sanitizedMessage.slice(prefix);
          if (!delta || sanitizedMessage === lastEmittedMessage) {
            return;
          }
          lastEmittedMessage = sanitizedMessage;
          lastStreamedMessage = sanitizedMessage;
          try {
            onTextDelta(delta);
          } catch (err) {
            logger?.('chat.pipeline.error', { stage: `${stageLabel}_delta_emit`, model, error: formatLogValue(err) });
          }
        };

        const handleTextSnapshot = (snapshot: string) => {
          streamedText = snapshot;
          const trimmed = streamedText.trim();
          if (!trimmed) {
            return;
          }

          let parsedCandidate: unknown;
          try {
            const jsonCandidate = extractFirstJsonBlock(trimmed) ?? trimmed;
            parsedCandidate = JSON.parse(jsonCandidate);
          } catch {
            parsedCandidate = undefined;
          }

          if (parsedCandidate) {
            streamedParsed = parsedCandidate;
            const messageValue =
              typeof (parsedCandidate as { message?: unknown }).message === 'string'
                ? ((parsedCandidate as { message: string }).message as string)
                : null;
            emitMessageDelta?.(messageValue);
          } else {
            const partialMessage = extractMessageFromPartialJson(trimmed);
            if (partialMessage && partialMessage.length > lastEmittedMessage.length) {
              // Normalize escapes to prevent duplicate emission when JSON.parse later
              // returns the same content with decoded escape sequences
              emitMessageDelta?.(normalizeEscapes(partialMessage));
            }
          }
        };

        stream.on('response.output_text.delta', (event) => {
          try {
            const snapshot =
              typeof (event as { snapshot?: unknown }).snapshot === 'string'
                ? ((event as { snapshot: string }).snapshot as string)
                : typeof event.delta === 'string'
                  ? event.delta
                  : '';
            if (!snapshot) {
              return;
            }
            handleTextSnapshot(snapshot);
          } catch (err) {
            logger?.('chat.pipeline.error', { stage: `${stageLabel}_delta`, model, error: formatLogValue(err) });
          }
        });
      }

      const finalResponse = await stream.finalResponse();
      if (abortListener && signal) {
        signal.removeEventListener('abort', abortListener);
      }

      const usage = (finalResponse as { usage?: unknown })?.usage;
      if (usage) {
        logger?.('chat.pipeline.tokens', {
          stage: stageLabel,
          model,
          attempt,
          usage,
        });
        onUsage?.(stageLabel, model, usage);
      }

      const rawContent = streamedText || extractResponseOutputText(finalResponse);
      const structuredCandidate = extractResponseParsedContent(finalResponse) ?? streamedParsed;
      logger?.('chat.pipeline.model.raw', { stage: stageLabel, model, raw: rawContent, attempt });

      let candidate = structuredCandidate;
      let parsedFrom: 'structured' | 'text' | undefined = typeof structuredCandidate !== 'undefined' ? 'structured' : undefined;

      if (typeof candidate === 'undefined') {
        const trimmedContent = typeof rawContent === 'string' ? rawContent.trim() : '';
        let parseError: unknown = null;
        if (trimmedContent.length > 0) {
          try {
            candidate = JSON.parse(trimmedContent);
            parsedFrom = 'text';
          } catch (initialError) {
            try {
              const fallback = extractFirstJsonBlock(trimmedContent);
              if (!fallback) {
                throw initialError;
              }
              candidate = JSON.parse(fallback);
              parsedFrom = 'text';
            } catch (error) {
              parseError = error;
            }
          }
        } else {
          parseError = new Error('json_parse_failure');
        }

        if (typeof candidate === 'undefined') {
          lastError = parseError;
          logger?.('chat.pipeline.model.parse_error', {
            stage: stageLabel,
            model,
            raw: typeof rawContent === 'string' ? rawContent.slice(0, 2000) : rawContent,
            error: formatLogValue(parseError ?? 'unknown'),
            attempt,
          });
          continue;
        }
      }

      if (emitMessageDelta) {
        const finalMessage =
          candidate && typeof candidate === 'object' && typeof (candidate as { message?: unknown }).message === 'string'
            ? ((candidate as { message: string }).message as string)
            : null;
        emitMessageDelta(finalMessage);
      }

      if (candidate && typeof candidate === 'object' && typeof (candidate as { message?: unknown }).message === 'string') {
        const currentMessage = (candidate as { message: string }).message as string;
        (candidate as { message: string }).message = sanitizeMessageSnapshot(
          currentMessage,
          lastStreamedMessage || lastEmittedMessage
        );
      }

      const validated = schema.safeParse(candidate);
      if (!validated.success) {
        lastError = validated.error.issues;
        logger?.('chat.pipeline.model.validation_error', {
          stage: stageLabel,
          model,
          attempt,
          issues: validated.error.issues,
        });
        let candidatePreview: string | undefined;
        try {
          if (candidate === null) {
            candidatePreview = 'null';
          } else if (typeof candidate === 'object') {
            candidatePreview = JSON.stringify(candidate).slice(0, 2000);
          } else {
            candidatePreview = String(candidate).slice(0, 2000);
          }
        } catch {
          candidatePreview = '[unserializable]';
        }
        logger?.('chat.pipeline.model.raw_candidate', {
          stage: stageLabel,
          model,
          attempt,
          candidateSource: parsedFrom ?? 'unknown',
          candidateType: candidate === null ? 'null' : typeof candidate,
          candidatePreview,
          rawTextPreview: typeof rawContent === 'string' ? rawContent.slice(0, 2000) : rawContent,
        });
        continue;
      }
      return validated.data;
    } catch (error) {
      lastError = error;
      logger?.('chat.pipeline.model.error', { stage: stageLabel, model, error: formatLogValue(error), attempt });
      continue;
    } finally {
      if (abortListener && signal) {
        signal.removeEventListener('abort', abortListener);
      }
    }
  }

  logger?.('chat.pipeline.model.fallback', { stage: stageLabel, model, lastError: formatLogValue(lastError ?? 'unknown') });
  if (throwOnFailure) {
    throw new Error(`chat_pipeline_model_failure:${model}`);
  }
  throw lastError instanceof Error ? lastError : new Error(formatLogValue(lastError ?? 'unknown'));
}

function buildProjectEvidenceSnippet(project: ProjectDoc): string | undefined {
  const bullets = (project.bullets ?? []).slice(0, 3).join(' ');
  const combined = [
    project.oneLiner,
    project.description,
    project.impactSummary,
    project.sizeOrScope,
    bullets,
  ]
    .filter(Boolean)
    .join(' ');
  return normalizeSnippet(combined, 360);
}

function buildExperienceEvidenceSnippet(experience: ExperienceDoc): string | undefined {
  const bullets = (experience.bullets ?? []).slice(0, 3).join(' ');
  const skills = (experience.skills ?? []).slice(0, 6).join(', ');
  const combined = [
    experience.title,
    experience.company,
    experience.impactSummary,
    experience.sizeOrScope,
    experience.summary,
    bullets,
    skills,
  ]
    .filter(Boolean)
    .join(' ');
  return normalizeSnippet(combined, 360);
}

function buildEducationEvidenceSnippet(education: EducationDoc): string | undefined {
  const bullets = (education.bullets ?? []).slice(0, 3).join(' ');
  const skills = (education.skills ?? []).slice(0, 6).join(', ');
  const combined = [
    education.institution,
    [education.degree, education.field].filter(Boolean).join(' '),
    education.summary,
    bullets,
    skills,
  ]
    .filter(Boolean)
    .join(' ');
  return normalizeSnippet(combined, 360);
}

function buildAwardEvidenceSnippet(award: AwardDoc): string | undefined {
  const bullets = (award.bullets ?? []).slice(0, 3).join(' ');
  const skills = (award.skills ?? []).slice(0, 6).join(', ');
  const combined = [award.title, award.issuer, award.summary, bullets, skills].filter(Boolean).join(' ');
  return normalizeSnippet(combined, 360);
}

function buildSkillEvidenceSnippet(skill: SkillDoc): string | undefined {
  const combined = [skill.name, skill.category, (skill.skills ?? []).slice(0, 6).join(', ')].filter(Boolean).join(' ');
  return normalizeSnippet(combined, 240);
}

function buildEvidenceUserContent(input: {
  userMessage: string;
  plan: RetrievalPlan;
  retrieved: RetrievalResult;
}): string {
  const { userMessage, plan, retrieved } = input;
  const projectBodyIds = new Set(retrieved.projects.slice(0, PROJECT_BODY_SNIPPET_COUNT).map((proj) => proj.id));
  const experienceBodyIds = new Set(retrieved.experiences.slice(0, EXPERIENCE_BODY_SNIPPET_COUNT).map((exp) => exp.id));
  const educationBodyIds = new Set(retrieved.education.slice(0, EXPERIENCE_BODY_SNIPPET_COUNT).map((edu) => edu.id));
  const awardBodyIds = new Set(retrieved.awards.slice(0, EXPERIENCE_BODY_SNIPPET_COUNT).map((award) => award.id));
  return [
    `Latest user turn: ${userMessage}`,
    '',
    `Retrieval plan JSON:\n${JSON.stringify(plan, null, 2)}`,
    '',
    `Retrieved projects (${retrieved.projects.length}):`,
    JSON.stringify(
      retrieved.projects.map((proj) => ({
        id: proj.id,
        name: proj.name,
        oneLiner: proj.oneLiner,
        description: normalizeSnippet(proj.description, 360),
        impactSummary: proj.impactSummary,
        sizeOrScope: proj.sizeOrScope,
        evidenceSnippet: buildProjectEvidenceSnippet(proj),
        bullets: proj.bullets.slice(0, 5),
        techStack: proj.techStack,
        languages: proj.languages,
        tags: proj.tags,
        contextType: proj.context?.type,
        organization: proj.context?.organization,
        role: proj.context?.role,
        timeframe: proj.context?.timeframe,
        bodySnippet: projectBodyIds.has(proj.id)
          ? normalizeSnippet(proj.readme || proj.description || proj.oneLiner, MAX_BODY_SNIPPET_CHARS)
          : undefined,
      })),
      null,
      2
    ),
    '',
    `Retrieved experiences (${retrieved.experiences.length}):`,
    JSON.stringify(
      retrieved.experiences.map((exp) => ({
        id: exp.id,
        company: exp.company,
        title: exp.title,
        impactSummary: exp.impactSummary,
        sizeOrScope: exp.sizeOrScope,
        bullets: (exp.bullets ?? []).slice(0, 6),
        skills: exp.skills,
        startDate: exp.startDate,
        endDate: exp.endDate,
        experienceType: exp.experienceType,
        linkedProjects: exp.linkedProjects,
        evidenceSnippet: buildExperienceEvidenceSnippet(exp),
        bodySnippet: experienceBodyIds.has(exp.id)
          ? normalizeSnippet(
            [exp.title, exp.company, exp.impactSummary, exp.sizeOrScope, ...(exp.bullets ?? [])].join(' '),
            MAX_BODY_SNIPPET_CHARS
          )
          : undefined,
      })),
      null,
      2
    ),
    '',
    `Retrieved education (${retrieved.education.length}):`,
    JSON.stringify(
      retrieved.education.map((edu) => ({
        id: edu.id,
        institution: edu.institution,
        degree: edu.degree,
        field: edu.field,
        bullets: (edu.bullets ?? []).slice(0, 6),
        skills: edu.skills,
        summary: edu.summary,
        evidenceSnippet: buildEducationEvidenceSnippet(edu),
        bodySnippet: educationBodyIds.has(edu.id)
          ? normalizeSnippet(
            [edu.institution, edu.degree, edu.field, edu.summary, ...(edu.bullets ?? [])].join(' '),
            MAX_BODY_SNIPPET_CHARS
          )
          : undefined,
      })),
      null,
      2
    ),
    '',
    `Retrieved awards (${retrieved.awards.length}):`,
    JSON.stringify(
      retrieved.awards.map((award) => ({
        id: award.id,
        title: award.title,
        issuer: award.issuer,
        date: award.date,
        bullets: (award.bullets ?? []).slice(0, 6),
        skills: award.skills,
        summary: award.summary,
        evidenceSnippet: buildAwardEvidenceSnippet(award),
        bodySnippet: awardBodyIds.has(award.id)
          ? normalizeSnippet(
            [award.title, award.issuer, award.summary, ...(award.bullets ?? [])].join(' '),
            MAX_BODY_SNIPPET_CHARS
          )
          : undefined,
      })),
      null,
      2
    ),
    '',
    `Retrieved skills (${retrieved.skills.length}):`,
    JSON.stringify(
      retrieved.skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        category: skill.category,
        skills: skill.skills,
        evidenceSnippet: buildSkillEvidenceSnippet(skill),
      })),
      null,
      2
    ),
    '',
    `Profile (if any): ${JSON.stringify(retrieved.profile ?? null, null, 2)}`,
    '',
    'selectedEvidence must cite the IDs from the retrieved docs and include { source, id, title, snippet, relevance }.',
    `Intent: ${plan.intent}. enumerateAllRelevant: ${plan.enumerateAllRelevant ? 'true' : 'false'}.`,
    '- Populate uiHints.projects / uiHints.experiences with ordered IDs from the retrieved docs only.',
    '- For intent=fact_check keep uiHints to the strongest supporting examples; for intent=enumerate include all clearly relevant projects/experiences (ordered).',
    '- If evidenceCompleteness is "none", set highLevelAnswer to "unknown" or "not_applicable", selectedEvidence to [], and uiHints to empty arrays.',
    'Return ONLY the EvidenceSummary JSON with keys highLevelAnswer, evidenceCompleteness, reasoning, selectedEvidence, semanticFlags, uiHints.',
  ].join('\n');
}

type BuildAnswerUserContentInput = {
  userMessage: string;
  conversationSnippet: string;
  plan: RetrievalPlan;
  evidence: EvidenceSummary;
  identityDetails?: IdentityContext;
  persona?: PersonaSummary;
};

export function buildAnswerSystemPrompt(persona?: PersonaSummary, owner?: OwnerConfig): string {
  const sections: string[] = [applyOwnerTemplate(answerSystemPrompt, owner)];
  if (persona?.systemPersona) {
    sections.push(`Persona:\n${persona.systemPersona}`);
  }
  if (persona?.styleGuidelines?.length) {
    sections.push(['Style guidelines:', ...persona.styleGuidelines.map((rule) => `- ${rule}`)].join('\n'));
  }
  return sections.filter(Boolean).join('\n\n');
}

function resolveIdentityDetails(profile?: ProfileDoc | null, persona?: PersonaSummary, identityContext?: IdentityContext): IdentityContext {
  return {
    fullName: identityContext?.fullName ?? profile?.fullName,
    headline: identityContext?.headline ?? profile?.headline,
    location: identityContext?.location ?? profile?.location,
    shortAbout: identityContext?.shortAbout ?? persona?.shortAbout,
  };
}

function buildMetaIntro(identityDetails?: IdentityContext, persona?: PersonaSummary): string {
  const shortAbout = (identityDetails?.shortAbout ?? persona?.shortAbout)?.trim();
  const invitation = 'Ask me about my projects or experience.';
  if (shortAbout) {
    const match = shortAbout.match(/[^.!?]+[.!?]?/);
    const firstSentence = (match?.[0] ?? shortAbout).trim();
    const normalized = firstSentence.endsWith('.') ? firstSentence : `${firstSentence}.`;
    return `${normalized} ${invitation}`;
  }

  const firstName = identityDetails?.fullName?.split(' ')?.[0]?.trim();
  const headline = identityDetails?.headline?.trim();
  if (firstName && headline) {
    return `I'm ${firstName}, ${headline}. ${invitation}`;
  }
  if (firstName) {
    return `I'm ${firstName}. ${invitation}`;
  }
  if (headline) {
    return `I'm a ${headline}. ${invitation}`;
  }
  return 'I can answer questions about my projects, experience, and skills.';
}

export function buildAnswerUserContent(input: BuildAnswerUserContentInput): string {
  const { userMessage, conversationSnippet, plan, evidence, identityDetails, persona } = input;

  if (plan.intent === 'meta') {
    const metaIntro = buildMetaIntro(identityDetails, persona);
    const identityBlock = {
      metaIntro,
      shortAbout: identityDetails?.shortAbout,
      fullName: identityDetails?.fullName,
      headline: identityDetails?.headline,
      location: identityDetails?.location,
    };
    return [
      `Conversation:\n${conversationSnippet}`,
      '',
      `Latest user turn: ${userMessage}`,
      '',
      'You are answering a quick meta/greeting turn as the portfolio owner. Respond in first-person, keep it to 1-2 warm sentences, and invite them to ask about projects or experience.',
      'If you already introduced yourself earlier in the conversation, avoid repeating the exact intro—acknowledge their new message instead.',
      `Identity context (for grounding):\n${JSON.stringify(identityBlock, null, 2)}`,
      '',
      'Do not cite projects or resume entries unless the user explicitly asked about them.',
      'Return strict JSON matching AnswerPayload: {"message": string, "thoughts": string[]}.',
      '- message: exactly the assistant reply text for the user.',
      '- thoughts (optional): 1-3 short bullet-style sentences explaining how you approached the greeting.',
    ].join('\n');
  }

  const retrievalFocus = inferRetrievalFocus(plan.retrievalRequests, plan.intent, plan.experienceScope, plan.resumeFacets);
  const planSummary = {
    intent: plan.intent,
    experienceScope: plan.experienceScope ?? null,
    retrievalFocus,
    answerMode: plan.answerMode,
    answerLengthHint: plan.answerLengthHint,
    topic: plan.topic,
    resumeFacets: plan.resumeFacets ?? [],
    enumerateAllRelevant: plan.enumerateAllRelevant,
  };
  const trimmedEvidence = {
    highLevelAnswer: evidence.highLevelAnswer,
    evidenceCompleteness: evidence.evidenceCompleteness,
    reasoning: evidence.reasoning,
    semanticFlags: evidence.semanticFlags,
    uiHints: evidence.uiHints ?? { projects: [], experiences: [] },
  };

  return [
    `Conversation:\n${conversationSnippet}`,
    '',
    `Latest user turn: ${userMessage}`,
    '',
    `Planner summary:\n${JSON.stringify(planSummary, null, 2)}`,
    '',
    `Evidence summary:\n${JSON.stringify(trimmedEvidence, null, 2)}`,
    '',
    'You do NOT have access to raw documents—only the fields inside EvidenceSummary plus persona/profile/plan metadata.',
    '',
    'Return strict JSON matching AnswerPayload: {"message": string, "thoughts": string[], "uiHints"?: {"projects": string[], "experiences": string[]}}.',
    '- message: final assistant reply text grounded in the evidence/profile. Use selectedEvidence as the named examples; treat uiHints.projects / uiHints.experiences as the full set of relevant items (especially when enumerateAllRelevant=true) and acknowledge that the UI will show all of them.',
    "- thoughts (optional): ordered list (2-5 items) explaining how you interpreted the evidence and uiHints. Keep each thought to <=160 characters and don't mention tool internals.",
    '- uiHints (optional): If your answer explicitly references specific projects or experiences, you may refine uiHints to match exactly what you mention. Only include IDs that appear in the evidence uiHints. Omit this field to use the evidence stage uiHints as-is.',
  ].join('\n');
}

type ResumeMaps = {
  experience: Map<string, ExperienceDoc>;
  education: Map<string, EducationDoc>;
  award: Map<string, AwardDoc>;
  skill: Map<string, SkillDoc>;
};

function normalizeDocId(value?: string | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

function dedupeDocIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const raw of ids) {
    const normalized = normalizeDocId(raw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    ordered.push(normalized);
  }
  return ordered;
}

function resolveResumeEntry(resumeMaps: ResumeMaps, id: string): ResumeDoc | undefined {
  return (
    resumeMaps.experience.get(id) ??
    resumeMaps.education.get(id) ??
    resumeMaps.award.get(id) ??
    resumeMaps.skill.get(id)
  );
}

function summarizeSelectedEvidence(evidence: EvidenceSummary): HowIAnsweredSummary {
  let projectCount = 0;
  let resumeCount = 0;
  let profileCount = 0;
  for (const entry of evidence.selectedEvidence ?? []) {
    if (entry.source === 'project') {
      projectCount += 1;
    } else if (entry.source === 'resume') {
      resumeCount += 1;
    } else if (entry.source === 'profile') {
      profileCount += 1;
    }
  }

  return {
    totalEvidence: projectCount + resumeCount + profileCount,
    projectCount,
    resumeCount,
    profileCount,
  };
}

function summarizeRetrievalResult(result: RetrievalResult) {
  return {
    projects: result.projects.length,
    experiences: result.experiences.length,
    education: result.education.length,
    awards: result.awards.length,
    skills: result.skills.length,
    hasProfile: Boolean(result.profile),
    totalDocs:
      result.projects.length +
      result.experiences.length +
      result.education.length +
      result.awards.length +
      result.skills.length,
  };
}

function logPipelineSummary(params: {
  logger?: ChatRuntimeOptions['logger'];
  plan: RetrievalPlan;
  rawRetrieval: RetrievalResult;
  evidenceInput: RetrievalResult;
  evidence: EvidenceSummary;
  howIAnswered: HowIAnsweredSummary;
  answerText: string;
  timings: Record<string, number>;
  models: { planner: string; evidence: string; answer: string };
  fastPath?: 'no_docs' | 'meta' | null;
  reasoning?: { requested?: boolean; allowReasoning: boolean; environment?: string | undefined };
}) {
  if (!params.logger) return;
  const retrievalFocus = inferRetrievalFocus(
    params.plan.retrievalRequests,
    params.plan.intent,
    params.plan.experienceScope,
    params.plan.resumeFacets
  );
  params.logger('chat.pipeline.summary', {
    plan: {
      intent: params.plan.intent,
      experienceScope: params.plan.experienceScope ?? null,
      retrievalFocus,
      answerMode: params.plan.answerMode,
      answerLengthHint: params.plan.answerLengthHint,
      plannerConfidence: params.plan.plannerConfidence,
      enumerateAllRelevant: params.plan.enumerateAllRelevant,
      uiTarget: params.plan.uiTarget ?? null,
      retrievalRequests: params.plan.retrievalRequests.map((request) => ({
        source: request.source,
        topK: request.topK,
        queryText: request.queryText,
      })),
    },
    retrieval: {
      requested: summarizeRetrievalResult(params.rawRetrieval),
      evidenceInput: summarizeRetrievalResult(params.evidenceInput),
    },
    evidence: {
      highLevelAnswer: params.evidence.highLevelAnswer,
      evidenceCompleteness: params.evidence.evidenceCompleteness,
      selectedCount: params.evidence.selectedEvidence.length,
      semanticFlags: params.evidence.semanticFlags.map((flag) => flag.type),
      uiHints: {
        projects: params.evidence.uiHints?.projects?.length ?? 0,
        experiences: params.evidence.uiHints?.experiences?.length ?? 0,
      },
    },
    answer: {
      characters: params.answerText.length,
      paragraphs: params.answerText.trim().length ? params.answerText.split(/\n{2,}/).length : 0,
      fastPath: params.fastPath ?? null,
      howIAnswered: params.howIAnswered,
    },
    reasoning: params.reasoning
      ? {
        requested: params.reasoning.requested ?? null,
        allowReasoning: params.reasoning.allowReasoning,
        environment: params.reasoning.environment ?? process.env.NODE_ENV ?? null,
      }
      : undefined,
    models: params.models,
    timings: params.timings,
  });
}

type BuildUiArtifactsParams = {
  plan: RetrievalPlan;
  evidence: EvidenceSummary;
  projectMap: Map<string, ProjectDoc>;
  resumeMaps: ResumeMaps;
  retrieval: RetrievalResult;
  bannerOverride?: string;
  maxDisplayItems?: number;
  logger?: ChatRuntimeOptions['logger'];
};

export function buildUiArtifacts(params: BuildUiArtifactsParams): UiPayload {
  const maxDisplayItems = params.maxDisplayItems ?? MAX_DISPLAY_ITEMS;
  const coreEvidenceIds = dedupeDocIds(params.evidence.selectedEvidence.map((item) => item.id));
  const retrievedProjectIds = new Set(
    params.retrieval.projects
      .map((proj) => normalizeDocId(proj.id))
      .filter((id): id is string => Boolean(id))
  );
  const retrievedExperienceIds = new Set(
    params.retrieval.experiences
      .map((exp) => normalizeDocId(exp.id))
      .filter((id): id is string => Boolean(id))
  );
  const filteredUiHints = params.evidence.uiHints ?? { projects: [], experiences: [] };
  if (params.evidence.uiHintWarnings?.length) {
    params.logger?.('chat.pipeline.uihint.warnings', { warnings: params.evidence.uiHintWarnings });
  }

  const sanitizeIds = (ids: string[] | undefined, allowed: Set<string>) => {
    const ordered: string[] = [];
    const seen = new Set<string>();
    for (const raw of ids ?? []) {
      const normalized = normalizeDocId(raw);
      if (!normalized || seen.has(normalized) || !allowed.has(normalized)) continue;
      seen.add(normalized);
      ordered.push(normalized);
    }
    return ordered;
  };

  const hintedProjects = filteredUiHints.projects;
  const hintedExperiences = filteredUiHints.experiences;
  const fallbackProjects = sanitizeIds(
    params.evidence.selectedEvidence.filter((item) => item.source === 'project').map((item) => item.id),
    retrievedProjectIds
  );
  const fallbackExperiences = sanitizeIds(
    params.evidence.selectedEvidence.filter((item) => item.source === 'resume').map((item) => item.id),
    retrievedExperienceIds
  );

  let projectIds: string[];
  let experienceIds: string[];
  if (params.plan.enumerateAllRelevant) {
    projectIds = hintedProjects;
    experienceIds = hintedExperiences;
  } else {
    projectIds = hintedProjects.length ? hintedProjects : fallbackProjects;
    experienceIds = hintedExperiences.length ? hintedExperiences : fallbackExperiences;
  }

  // Apply uiTarget suppression: only 'text' suppresses cards
  // Evidence stage's uiHints determines WHICH cards to show (projects vs experiences)
  if (params.plan.uiTarget === 'text') {
    // User wants text answer only, suppress all cards
    projectIds = [];
    experienceIds = [];
  }
  // Otherwise, trust evidence stage's uiHints (default behavior)

  let bannerText = params.bannerOverride;

  const suppressCards =
    (params.evidence.highLevelAnswer === 'no' || params.evidence.highLevelAnswer === 'unknown') &&
    (params.plan.intent === 'meta' || params.plan.answerMode === 'meta_chitchat');

  if (suppressCards) {
    projectIds = [];
    experienceIds = [];
    if (!bannerText) {
      bannerText = ZERO_EVIDENCE_BANNER;
    }
  }

  const originalProjectCount = projectIds.length;
  const originalExperienceCount = experienceIds.length;

  if (params.plan.enumerateAllRelevant && !projectIds.length && !experienceIds.length && !bannerText) {
    bannerText = ZERO_EVIDENCE_BANNER;
  }

  if (params.plan.answerMode === 'binary_with_evidence') {
    projectIds = projectIds.slice(0, maxDisplayItems);
    experienceIds = experienceIds.slice(0, Math.max(0, maxDisplayItems - projectIds.length));
  } else if (params.plan.enumerateAllRelevant) {
    const truncatedProjects = projectIds.slice(0, maxDisplayItems);
    const truncatedExperiences = experienceIds.slice(0, Math.max(0, maxDisplayItems - truncatedProjects.length));
    const remaining =
      (originalProjectCount - truncatedProjects.length) + (originalExperienceCount - truncatedExperiences.length);
    projectIds = truncatedProjects;
    experienceIds = truncatedExperiences;
    if (!bannerText && remaining > 0) {
      bannerText = `and ${remaining} more related item${remaining === 1 ? '' : 's'}...`;
    }
  } else {
    projectIds = projectIds.slice(0, maxDisplayItems);
    experienceIds = experienceIds.slice(0, Math.max(0, maxDisplayItems - projectIds.length));
  }

  return {
    showProjects: projectIds,
    showExperiences: experienceIds,
    bannerText,
    coreEvidenceIds,
  };
}

function buildAttachmentPayloads(
  ui: UiPayload,
  projectMap: Map<string, ProjectDoc>,
  resumeMaps: ResumeMaps
): AttachmentPayload[] {
  const attachments: AttachmentPayload[] = [];

  const addProject = (id: string) => {
    const project = projectMap.get(id);
    if (!project) return;
    const { readme, ...rest } = project as ProjectDoc & { readme?: string };
    attachments.push({
      type: 'project',
      id,
      data: {
        ...rest,
        readme: readme ? normalizeSnippet(readme, 1200) : undefined,
      },
    });
  };

  const addResume = (id: string) => {
    const entry = resolveResumeEntry(resumeMaps, id);
    if (!entry) return;
    attachments.push({
      type: 'resume',
      id,
      data: { ...entry },
    });
  };

  ui.showProjects.forEach(addProject);
  ui.showExperiences.forEach(addResume);
  return attachments;
}

function capEnumerationDocs(retrieved: RetrievalResult, maxDocs = MAX_ENUMERATION_DOCS): RetrievalResult {
  type DocKind = 'project' | 'experience' | 'education' | 'award' | 'skill' | 'profile';
  const scored: Array<{ kind: DocKind; id: string; score: number; index: number }> = [];
  const scoreFrom = (value: number | undefined, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const pushDocs = <T extends { id?: string; _score?: number }>(items: T[], kind: DocKind, fallback: number) => {
    items.forEach((item, index) => {
      const id = normalizeDocId((item as { id?: string }).id ?? '');
      if (!id) return;
      scored.push({
        kind,
        id,
        score: scoreFrom((item as { _score?: number })._score, fallback),
        index,
      });
    });
  };

  pushDocs(retrieved.projects, 'project', 0.6);
  pushDocs(retrieved.experiences, 'experience', 0.7);
  pushDocs(retrieved.education, 'education', 0.55);
  pushDocs(retrieved.awards, 'award', 0.55);
  pushDocs(retrieved.skills, 'skill', 0.5);
  if (retrieved.profile) {
    scored.push({ kind: 'profile', id: 'profile', score: 0.8, index: 0 });
  }

  const selected = scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(0, maxDocs));

  const selectIds = (kind: DocKind) => new Set(selected.filter((entry) => entry.kind === kind).map((entry) => entry.id));
  const selectedProjects = selectIds('project');
  const selectedExperiences = selectIds('experience');
  const selectedEducation = selectIds('education');
  const selectedAwards = selectIds('award');
  const selectedSkills = selectIds('skill');
  const includeProfile = selected.some((entry) => entry.kind === 'profile');

  return {
    projects: retrieved.projects.filter((proj) => selectedProjects.has(normalizeDocId(proj.id))),
    experiences: retrieved.experiences.filter((exp) => selectedExperiences.has(normalizeDocId(exp.id))),
    education: retrieved.education.filter((edu) => selectedEducation.has(normalizeDocId(edu.id))),
    awards: retrieved.awards.filter((award) => selectedAwards.has(normalizeDocId(award.id))),
    skills: retrieved.skills.filter((skill) => selectedSkills.has(normalizeDocId(skill.id))),
    profile: includeProfile ? retrieved.profile : undefined,
  };
}

function limitEvidenceDocs(retrieved: RetrievalResult, plan: RetrievalPlan): RetrievalResult {
  if (plan.enumerateAllRelevant) {
    return capEnumerationDocs(retrieved);
  }
  const resumeFacetSet = new Set(plan.resumeFacets ?? []);
  const focus = inferRetrievalFocus(plan.retrievalRequests, plan.intent, plan.experienceScope, plan.resumeFacets);
  const wantsResumeFocus = focus === 'resume';
  const wantsProjectFocus = focus === 'projects';
  const wantsMixedFocus = focus === 'mixed';
  const scopeBias = plan.experienceScope === 'employment_only' ? 0.8 : 0;
  const mixedBias = wantsMixedFocus ? 0.4 : 0;

  const prioritize = (value: number): number => Math.max(0, value);

  let projectPriority = 2 + (wantsProjectFocus ? 2.5 : 0) + mixedBias;
  let experiencePriority =
    2 +
    (wantsResumeFocus ? 2.5 : 0) +
    (resumeFacetSet.has('experience') ? 0.8 : 0) +
    scopeBias +
    mixedBias;
  let educationPriority = 1 + (resumeFacetSet.has('education') ? 1.5 : 0);
  let awardPriority = 0.9 + (resumeFacetSet.has('award') ? 1.2 : 0);
  let skillPriority = 0.8 + (resumeFacetSet.has('skill') ? 1.2 : 0);

  projectPriority = prioritize(projectPriority);
  experiencePriority = prioritize(experiencePriority);
  educationPriority = prioritize(educationPriority);
  awardPriority = prioritize(awardPriority);
  skillPriority = prioritize(skillPriority);

  type BucketKey = 'projects' | 'experiences' | 'education' | 'awards' | 'skills';
  type Bucket = {
    key: BucketKey;
    limit: number;
    priority: number;
    docs: ProjectDoc[] | ExperienceDoc[] | EducationDoc[] | AwardDoc[] | SkillDoc[];
  };

  const buckets: Bucket[] = [
    { key: 'experiences', limit: EVIDENCE_EXPERIENCE_LIMIT, priority: experiencePriority, docs: retrieved.experiences },
    { key: 'projects', limit: EVIDENCE_PROJECT_LIMIT, priority: projectPriority, docs: retrieved.projects },
    { key: 'education', limit: EVIDENCE_EDUCATION_LIMIT, priority: educationPriority, docs: retrieved.education },
    { key: 'awards', limit: EVIDENCE_AWARD_LIMIT, priority: awardPriority, docs: retrieved.awards },
    { key: 'skills', limit: EVIDENCE_SKILL_LIMIT, priority: skillPriority, docs: retrieved.skills },
  ];

  buckets.sort((a, b) => b.priority - a.priority);

  const limited: RetrievalResult = {
    projects: [],
    experiences: [],
    education: [],
    awards: [],
    skills: [],
    profile: retrieved.profile,
  };

  let remaining = TOTAL_EVIDENCE_DOC_LIMIT;
  for (const bucket of buckets) {
    if (remaining <= 0) {
      (limited[bucket.key] as typeof bucket.docs) = [];
      continue;
    }
    const allowed = Math.min(bucket.docs.length, bucket.limit, remaining);
    (limited[bucket.key] as typeof bucket.docs) = bucket.docs.slice(0, allowed) as typeof bucket.docs;
    remaining -= allowed;
  }

  return limited;
}

type EvidenceCandidateDocType = 'project' | 'experience' | 'education' | 'award' | 'skill' | 'profile';

type EvidenceCandidate = {
  key: string;
  docType: EvidenceCandidateDocType;
  rankScore: number;
  item: EvidenceItem;
};

function scoreFromDoc(score: number | undefined, fallback = 0.6): number {
  if (typeof score === 'number' && Number.isFinite(score)) {
    return score;
  }
  return fallback;
}

function formatExperienceTitle(exp: ExperienceDoc): string {
  const company = exp.company?.trim();
  const title = exp.title?.trim();
  if (company && title) {
    return `${company} — ${title}`;
  }
  return title ?? company ?? exp.id;
}

function formatEducationTitle(education: EducationDoc): string {
  const pieces = [education.institution, education.degree, education.field].filter((value) => Boolean(value?.trim()));
  return pieces.join(' — ') || education.id;
}

function formatAwardTitle(award: AwardDoc): string {
  const pieces = [award.title, award.issuer].filter((value) => Boolean(value?.trim()));
  return pieces.join(' — ') || award.id;
}

function formatSkillTitle(skill: SkillDoc): string {
  const pieces = [skill.name, skill.category].filter((value) => Boolean(value?.trim()));
  return pieces.join(' — ') || skill.id;
}

function formatProfileTitle(profile?: ProfileDoc | null): string {
  if (!profile) {
    return 'Profile';
  }
  if (profile.fullName && profile.headline) {
    return `${profile.fullName} — ${profile.headline}`;
  }
  return profile.fullName ?? profile.headline ?? 'Profile';
}

function ensureSnippet(value: string | undefined, fallbackParts: Array<string | undefined>, maxChars = MAX_BODY_SNIPPET_CHARS): string {
  const normalized = value ? normalizeSnippet(value, maxChars) : undefined;
  if (normalized) return normalized;
  const fallbackText = fallbackParts.filter((part) => part && part.trim().length > 0).join(' ');
  const fallbackNormalized = normalizeSnippet(fallbackText, maxChars);
  if (fallbackNormalized) return fallbackNormalized;
  const first = fallbackParts.find((part) => part && part.trim().length > 0);
  return first?.trim() ?? 'See referenced document.';
}

function buildCandidateKey(source: EvidenceItem['source'], id: string): string {
  return `${source}:${id}`;
}

type ResumeKind = 'experience' | 'education' | 'award' | 'skill';

function getResumeKind(doc: ResumeDoc): ResumeKind {
  const kindValue =
    (doc as { kind?: string }).kind ??
    (doc as { type?: string }).type;
  if (kindValue === 'experience' || kindValue === 'education' || kindValue === 'award' || kindValue === 'skill') {
    return kindValue;
  }
  if ('company' in doc) return 'experience';
  if ('institution' in doc) return 'education';
  if ('issuer' in doc) return 'award';
  return 'skill';
}

function filterResumeByFacets<T extends ResumeDoc>(docs: T[], facets?: ResumeFacet[] | null): T[] {
  if (!facets || facets.length === 0) {
    return docs;
  }
  const allowed = new Set(facets);
  return docs.filter((doc) => allowed.has(getResumeKind(doc) as ResumeFacet));
}

function isEmploymentExperience(doc: ExperienceDoc): boolean {
  const normalized = (doc.experienceType ?? '').toLowerCase();
  if (!normalized) {
    return true;
  }
  const allowed = new Set(['full_time', 'contract', 'freelance', 'internship']);
  return allowed.has(normalized);
}

function applyExperienceScopeFilter(
  docs: {
    experiences: ExperienceDoc[];
    education: EducationDoc[];
    awards: AwardDoc[];
    skills: SkillDoc[];
  },
  scope?: ExperienceScope | null
): typeof docs {
  if (!scope || scope === 'any_experience') {
    return docs;
  }
  return {
    experiences: docs.experiences.filter((exp) => isEmploymentExperience(exp)),
    education: [],
    awards: [],
    skills: [],
  };
}

function validateAndFilterUiHints(
  uiHints: EvidenceUiHints,
  retrievedProjectIds: Set<string>,
  retrievedExperienceIds: Set<string>,
  logger?: ChatRuntimeOptions['logger']
): { filtered: EvidenceUiHints; warnings: UiHintValidationWarning[] } {
  const warnings: UiHintValidationWarning[] = [];
  const normalize = (ids: string[], allowed: Set<string>): string[] => {
    const ordered: string[] = [];
    const seen = new Set<string>();
    for (const raw of ids ?? []) {
      const normalized = normalizeDocId(raw);
      if (!normalized || seen.has(normalized) || !allowed.has(normalized)) continue;
      seen.add(normalized);
      ordered.push(normalized);
    }
    return ordered;
  };

  const filteredProjects = normalize(uiHints.projects ?? [], retrievedProjectIds);
  const filteredExperiences = normalize(uiHints.experiences ?? [], retrievedExperienceIds);

  const invalidProjects = (uiHints.projects ?? [])
    .map((id) => normalizeDocId(id))
    .filter((id): id is string => Boolean(id && !retrievedProjectIds.has(id)));
  if (invalidProjects.length) {
    warnings.push({
      code: 'UIHINT_INVALID_PROJECT_ID',
      invalidIds: invalidProjects,
      retrievedIds: Array.from(retrievedProjectIds),
    });
  }

  const invalidExperiences = (uiHints.experiences ?? [])
    .map((id) => normalizeDocId(id))
    .filter((id): id is string => Boolean(id && !retrievedExperienceIds.has(id)));
  if (invalidExperiences.length) {
    warnings.push({
      code: 'UIHINT_INVALID_EXPERIENCE_ID',
      invalidIds: invalidExperiences,
      retrievedIds: Array.from(retrievedExperienceIds),
    });
  }

  warnings.forEach((warning) => {
    logger?.('chat.pipeline.uihint.validation', warning);
  });

  return {
    filtered: { projects: filteredProjects, experiences: filteredExperiences },
    warnings,
  };
}

export function buildEvidenceCandidates(plan: RetrievalPlan, retrieved: RetrievalResult): EvidenceCandidate[] {
  const candidates: EvidenceCandidate[] = [];
  const resumeFacetSet = new Set(plan.resumeFacets ?? []);
  const focus = inferRetrievalFocus(plan.retrievalRequests, plan.intent, plan.experienceScope, plan.resumeFacets);
  const wantsResumeFocus = focus === 'resume';
  const wantsProjectFocus = focus === 'projects';
  const wantsMixedFocus = focus === 'mixed';
  const scopeBias = plan.experienceScope === 'employment_only' ? 0.6 : 0;
  const mixedBias = wantsMixedFocus ? 0.25 : 0;

  retrieved.projects.forEach((proj, index) => {
    const id = normalizeDocId(proj.id);
    if (!id) return;
    let rankScore = scoreFromDoc(proj._score, 0.8) + Math.max(0, 0.4 - index * 0.02);
    if (wantsProjectFocus) rankScore += 2.5;
    if (wantsMixedFocus) rankScore += mixedBias;
    rankScore = Math.max(0, rankScore);
    const title = proj.name || proj.slug || id;
    const snippet = ensureSnippet(
      buildProjectEvidenceSnippet(proj),
      [
        proj.description,
        proj.impactSummary,
        proj.oneLiner,
        proj.sizeOrScope,
        proj.readme,
        ...(proj.bullets ?? []),
      ]
    );
    const relevance: EvidenceItem['relevance'] = rankScore >= 3.5 ? 'high' : rankScore >= 1.2 ? 'medium' : 'low';
    candidates.push({
      key: buildCandidateKey('project', id),
      docType: 'project',
      rankScore,
      item: { source: 'project', id, title, snippet, relevance },
    });
  });

  retrieved.experiences.forEach((exp, index) => {
    const id = normalizeDocId(exp.id);
    if (!id) return;
    let rankScore = scoreFromDoc(exp._score, 1) + Math.max(0, 0.5 - index * 0.01);
    if (wantsResumeFocus) rankScore += 2.5;
    if (resumeFacetSet.has('experience')) rankScore += 0.8;
    rankScore += scopeBias;
    if (wantsMixedFocus) rankScore += mixedBias;
    rankScore = Math.max(0, rankScore);
    const snippet = ensureSnippet(
      buildExperienceEvidenceSnippet(exp),
      [
        exp.summary,
        exp.impactSummary,
        exp.sizeOrScope,
        exp.company,
        exp.title,
        ...(exp.bullets ?? []),
      ]
    );
    const relevance: EvidenceItem['relevance'] = rankScore >= 3 ? 'high' : rankScore >= 1.2 ? 'medium' : 'low';
    candidates.push({
      key: buildCandidateKey('resume', id),
      docType: 'experience',
      rankScore,
      item: {
        source: 'resume',
        id,
        title: formatExperienceTitle(exp),
        snippet,
        relevance,
      },
    });
  });

  retrieved.education.forEach((edu, index) => {
    const id = normalizeDocId(edu.id);
    if (!id) return;
    let rankScore = scoreFromDoc(edu._score, 0.8) + Math.max(0, 0.3 - index * 0.01);
    if (resumeFacetSet.has('education')) rankScore += 1.5;
    rankScore = Math.max(0, rankScore);
    const snippet = ensureSnippet(
      buildEducationEvidenceSnippet(edu),
      [edu.summary, ...(edu.bullets ?? []), edu.degree, edu.field, edu.institution]
    );
    const relevance: EvidenceItem['relevance'] = rankScore >= 2.5 ? 'high' : rankScore >= 1 ? 'medium' : 'low';
    candidates.push({
      key: buildCandidateKey('resume', id),
      docType: 'education',
      rankScore,
      item: {
        source: 'resume',
        id,
        title: formatEducationTitle(edu),
        snippet,
        relevance,
      },
    });
  });

  retrieved.awards.forEach((award, index) => {
    const id = normalizeDocId(award.id);
    if (!id) return;
    let rankScore = scoreFromDoc(award._score, 0.7) + Math.max(0, 0.2 - index * 0.01);
    if (resumeFacetSet.has('award')) rankScore += 1.2;
    rankScore = Math.max(0, rankScore);
    const snippet = ensureSnippet(
      buildAwardEvidenceSnippet(award),
      [award.summary, ...(award.bullets ?? []), award.title, award.issuer]
    );
    const relevance: EvidenceItem['relevance'] = rankScore >= 2 ? 'high' : rankScore >= 0.9 ? 'medium' : 'low';
    candidates.push({
      key: buildCandidateKey('resume', id),
      docType: 'award',
      rankScore,
      item: {
        source: 'resume',
        id,
        title: formatAwardTitle(award),
        snippet,
        relevance,
      },
    });
  });

  retrieved.skills.forEach((skill, index) => {
    const id = normalizeDocId(skill.id);
    if (!id) return;
    let rankScore = scoreFromDoc(skill._score, 0.6) + Math.max(0, 0.15 - index * 0.005);
    if (resumeFacetSet.has('skill')) rankScore += 1.2;
    rankScore = Math.max(0, rankScore);
    const snippet = ensureSnippet(
      buildSkillEvidenceSnippet(skill),
      [skill.summary, ...(skill.skills ?? []), skill.name, skill.category],
      240
    );
    const relevance: EvidenceItem['relevance'] = rankScore >= 1.5 ? 'high' : rankScore >= 0.7 ? 'medium' : 'low';
    candidates.push({
      key: buildCandidateKey('resume', id),
      docType: 'skill',
      rankScore,
      item: {
        source: 'resume',
        id,
        title: formatSkillTitle(skill),
        snippet,
        relevance,
      },
    });
  });

  if (retrieved.profile) {
    const profile = retrieved.profile;
    const snippet = ensureSnippet(undefined, [profile.headline, profile.location, ...(profile.about ?? [])]);
    candidates.push({
      key: buildCandidateKey('profile', 'profile'),
      docType: 'profile',
      rankScore: 0.5,
      item: {
        source: 'profile',
        id: 'profile',
        title: formatProfileTitle(profile),
        snippet,
        relevance: 'medium',
      },
    });
  }

  candidates.sort((a, b) => b.rankScore - a.rankScore);
  return candidates;
}

export function normalizeEvidenceSummaryPayload(
  plan: RetrievalPlan,
  summary: EvidenceSummary,
  retrieved: RetrievalResult,
  logger?: ChatRuntimeOptions['logger']
): EvidenceSummary {
  const isMeta = plan.intent === 'meta' || plan.answerMode === 'meta_chitchat';
  const isEnumerate = plan.intent === 'enumerate';
  const retrievedProjectIds = new Set(retrieved.projects.map((proj) => normalizeDocId(proj.id)).filter(Boolean));
  const retrievedExperienceIds = new Set(retrieved.experiences.map((exp) => normalizeDocId(exp.id)).filter(Boolean));
  const { filtered: normalizedUiHints, warnings: uiHintWarnings } = validateAndFilterUiHints(
    summary.uiHints ?? { projects: [], experiences: [] },
    retrievedProjectIds,
    retrievedExperienceIds,
    logger
  );

  if (isMeta) {
    const normalizedMeta: EvidenceSummary = {
      ...summary,
      highLevelAnswer: 'not_applicable',
      evidenceCompleteness: 'none',
      selectedEvidence: [],
      uiHints: { projects: [], experiences: [] },
    };
    logger?.('chat.pipeline.evidence.selection', {
      meta: true,
      rawCount: summary.selectedEvidence.length,
    });
    return normalizedMeta;
  }

  const candidates = buildEvidenceCandidates(plan, retrieved);
  const candidateMap = new Map(candidates.map((candidate) => [candidate.key, candidate.item]));
  const seen = new Set<string>();
  const filteredSelected: EvidenceItem[] = [];

  for (const entry of summary.selectedEvidence ?? []) {
    if (!entry?.id) continue;
    const normalizedId = normalizeDocId(entry.id);
    const source = entry.source;
    if (!normalizedId || !source) continue;
    const key = buildCandidateKey(source, normalizedId);
    if (seen.has(key)) continue;
    const candidate = candidateMap.get(key);
    if (!candidate) continue; // drop hallucinated/unused ids
    const relevance: EvidenceItem['relevance'] =
      entry.relevance && (['high', 'medium', 'low'] as const).includes(entry.relevance) ? entry.relevance : candidate.relevance;
    const snippet = ensureSnippet(entry.snippet, [candidate.snippet]);
    const title = entry.title?.trim() || candidate.title;
    filteredSelected.push({
      source: candidate.source,
      id: candidate.id,
      title,
      snippet,
      relevance,
    });
    seen.add(key);
    if (filteredSelected.length >= MAX_SELECTED_EVIDENCE) {
      break;
    }
  }

  const uiHintsEmpty = normalizedUiHints.projects.length + normalizedUiHints.experiences.length === 0;

  let evidenceCompleteness = summary.evidenceCompleteness;
  let highLevelAnswer = summary.highLevelAnswer;

  if (evidenceCompleteness === 'none') {
    highLevelAnswer = highLevelAnswer === 'not_applicable' ? 'not_applicable' : 'unknown';
  } else if (filteredSelected.length === 0 && uiHintsEmpty) {
    evidenceCompleteness = 'none';
    highLevelAnswer = highLevelAnswer === 'not_applicable' ? 'not_applicable' : 'unknown';
  } else if (filteredSelected.length === 0) {
    evidenceCompleteness = 'weak';
  }

  const suppressUiHints =
    isEnumerate && highLevelAnswer === 'no'
      ? true
      : evidenceCompleteness !== 'strong' && (highLevelAnswer === 'no' || highLevelAnswer === 'unknown');
  const finalUiHints =
    evidenceCompleteness === 'none' || suppressUiHints ? { projects: [], experiences: [] } : normalizedUiHints;

  const finalSelected =
    evidenceCompleteness === 'none' ? [] : filteredSelected.slice(0, MAX_SELECTED_EVIDENCE);

  const finalSummary: EvidenceSummary = {
    ...summary,
    highLevelAnswer,
    evidenceCompleteness,
    selectedEvidence: finalSelected,
    uiHints: finalUiHints,
    semanticFlags: summary.semanticFlags ?? [],
    uiHintWarnings: uiHintWarnings.length ? uiHintWarnings : undefined,
  };

  logger?.('chat.pipeline.evidence.selection', {
    rawCount: (summary.selectedEvidence ?? []).length,
    normalizedCount: finalSelected.length,
    uiHints: { projects: finalUiHints.projects.length, experiences: finalUiHints.experiences.length },
    evidenceCompleteness: finalSummary.evidenceCompleteness,
    suppressedUiHints: suppressUiHints,
  });
  if (uiHintWarnings.length) {
    logger?.('chat.pipeline.uihint.warnings', { warnings: uiHintWarnings });
  }

  return finalSummary;
}

export async function executeRetrievalPlan(
  retrieval: RetrievalDrivers,
  plan: RetrievalPlan,
  options?: { logger?: ChatRuntimeOptions['logger']; cache?: RetrievalCache; ownerId?: string }
): Promise<ExecutedRetrievalResult> {
  const projects: ProjectDoc[] = [];
  const experiences: ExperienceDoc[] = [];
  const education: EducationDoc[] = [];
  const awards: AwardDoc[] = [];
  const skills: SkillDoc[] = [];
  let profile: ProfileDoc | undefined = undefined;
  const resumeFacets = plan.resumeFacets ?? [];
  const retrievalSummaries: RetrievalSummary[] = [];
  const ownerKey = options?.ownerId ?? 'default';
  const profileCache = options?.cache?.profile;
  let profileHandled = false;

  const hasRetrievalRequests = Array.isArray(plan.retrievalRequests) && plan.retrievalRequests.length > 0;
  const autoIncludeProfile = plan.intent === 'describe' || plan.intent === 'meta';

  if (!hasRetrievalRequests && !autoIncludeProfile) {
    return {
      result: { projects, experiences, education, awards, skills, profile },
      summaries: [],
    };
  }

  const hasSkillFacetOnly = (plan.resumeFacets ?? []).length > 0 && (plan.resumeFacets ?? []).every((facet) => facet === 'skill');
  const isSkillEnumerate = plan.intent === 'enumerate' && hasSkillFacetOnly;
  const GENERIC_SKILL_REGEX = /\b(skill|skills|tech\s*stack|techstack|programming\s+languages?|languages?)\b/i;

  const getCacheKey = (
    source: 'projects' | 'resume',
    query: string,
    limit: number,
    facets?: ResumeFacet[]
  ) =>
    JSON.stringify({
      ownerId: ownerKey,
      source,
      query: query.toLowerCase().trim(),
      limit,
      facets: facets ?? [],
      scope: plan.experienceScope,
      intent: plan.intent,
      enumerateAllRelevant: plan.enumerateAllRelevant,
    });
  const cacheWithEviction = <T>(map: Map<string, T> | undefined, key: string, value: T, maxSize = 24) => {
    if (!map) return;
    if (map.size >= maxSize) {
      const firstKey = map.keys().next().value;
      if (firstKey) {
        map.delete(firstKey);
      }
    }
    map.set(key, value);
  };

  const recordCacheHit = (event: 'hit' | 'miss', source: string, key: string) => {
    options?.logger?.('chat.cache.retrieval', { event, source, key });
  };

  // Helper to strip noise words from the query to prevent broad matching
  const sanitizeQuery = (text: string): string => {
    const stopWords = ['projects', 'project', 'experiences', 'experience', 'resume'];
    // simplistic check: case-insensitive replace
    // \b matches word boundaries
    const regex = new RegExp(`\\b(${stopWords.join('|')})\\b`, 'gi');
    return text.replace(regex, '').replace(/\s+/g, ' ').trim();
  };

  for (const request of plan.retrievalRequests) {
    const rawQuery = request.queryText || '';
    // Strip noise words unless the query becomes empty (e.g. if user just asks "projects")
    const sanitized = sanitizeQuery(rawQuery);
    const query = sanitized.length > 0 ? sanitized : rawQuery;

    const summaryBase = {
      source: request.source,
      queryText: query,
      requestedTopK: request.topK,
    };
    const { effectiveTopK, reason: topkReason } = resolveTopK(plan, request.topK, request.source);
    options?.logger?.('chat.pipeline.topk', {
      source: request.source,
      requestedTopK: request.topK,
      effectiveTopK,
      reason: topkReason,
      plannerConfidence: plan.plannerConfidence,
      topicLength: plan.topic?.length ?? 0,
      enumerateAllRelevant: plan.enumerateAllRelevant,
      skipped: false,
    });
    const cache = options?.cache;
    if (request.source === 'projects') {
      const cacheKey = cache ? getCacheKey('projects', query, effectiveTopK) : null;
      if (cacheKey && cache?.projects.has(cacheKey)) {
        recordCacheHit('hit', 'projects', cacheKey);
        const cachedProjects = cache.projects.get(cacheKey) ?? [];
        projects.push(...cachedProjects);
        retrievalSummaries.push({
          ...summaryBase,
          effectiveTopK,
          numResults: cachedProjects.length,
        });
        continue;
      }

      recordCacheHit('miss', 'projects', cacheKey ?? 'nocache');
      const results = await retrieval.searchProjectsByText(query, effectiveTopK, {
        scope: plan.experienceScope ?? undefined,
      });
      if (cacheKey && cache) {
        cacheWithEviction(cache.projects, cacheKey, results);
      }
      projects.push(...results);
      retrievalSummaries.push({
        ...summaryBase,
        effectiveTopK,
        numResults: results.length,
      });
    } else if (request.source === 'resume') {
      const cacheKey = cache ? getCacheKey('resume', query, effectiveTopK, resumeFacets) : null;
      if (cacheKey && cache?.resume.has(cacheKey)) {
        recordCacheHit('hit', 'resume', cacheKey);
        const cached = cache.resume.get(cacheKey) ?? [];
        for (const result of cached) {
          if ('company' in result) {
            experiences.push(result as ExperienceDoc);
          } else if ('institution' in result) {
            education.push(result as EducationDoc);
          } else if ('issuer' in result) {
            awards.push(result as AwardDoc);
          } else {
            skills.push(result as SkillDoc);
          }
        }
        retrievalSummaries.push({
          ...summaryBase,
          effectiveTopK,
          numResults: cached.length,
        });
        continue;
      }
      recordCacheHit('miss', 'resume', cacheKey ?? 'nocache');
      const genericSkillQuery = isSkillEnumerate && (query.length === 0 || GENERIC_SKILL_REGEX.test(rawQuery.toLowerCase()));
      const results = genericSkillQuery
        ? await retrieval.searchExperiencesByText('', effectiveTopK, { facets: ['skill'] })
        : await retrieval.searchExperiencesByText(query, effectiveTopK, {
            facets: resumeFacets,
          });
      if (cacheKey && cache) {
        cacheWithEviction(cache.resume, cacheKey, results);
      }
      for (const result of results) {
        if ('company' in result) {
          experiences.push(result as ExperienceDoc);
        } else if ('institution' in result) {
          education.push(result as EducationDoc);
        } else if ('issuer' in result) {
          awards.push(result as AwardDoc);
        } else {
          skills.push(result as SkillDoc);
        }
      }
      retrievalSummaries.push({
        ...summaryBase,
        effectiveTopK,
        numResults: results.length,
      });
    } else if (request.source === 'profile') {
      const cachedProfile = profileCache?.get(ownerKey);
      profile = profile ?? cachedProfile ?? (await retrieval.getProfileDoc());
      if (profileCache && !profileCache.has(ownerKey)) {
        profileCache.set(ownerKey, profile ?? null);
      }
      profileHandled = true;
      retrievalSummaries.push({
        ...summaryBase,
        effectiveTopK,
        numResults: profile ? 1 : 0,
      });
    }
  }

  if (autoIncludeProfile && !profileHandled) {
    const cachedProfile = profileCache?.get(ownerKey);
    profile = profile ?? cachedProfile ?? (await retrieval.getProfileDoc());
    if (profileCache && !profileCache.has(ownerKey)) {
      profileCache.set(ownerKey, profile ?? null);
    }
    retrievalSummaries.push({
      source: 'profile',
      queryText: '',
      requestedTopK: 1,
      effectiveTopK: 1,
      numResults: profile ? 1 : 0,
    });
  }

  const dedupProjects = dedupeById(projects, (p) => p.id);
  const dedupExperiences = dedupeById(experiences, (e) => e.id);
  const dedupEducation = dedupeById(education, (e) => e.id);
  const dedupAwards = dedupeById(awards, (a) => a.id);
  const dedupSkills = dedupeById(skills, (s) => s.id);

  const resumeDocs = {
    experiences: filterResumeByFacets(dedupExperiences, resumeFacets),
    education: filterResumeByFacets(dedupEducation, resumeFacets),
    awards: filterResumeByFacets(dedupAwards, resumeFacets),
    skills: filterResumeByFacets(dedupSkills, resumeFacets),
  };
  const scopedResumeDocs = applyExperienceScopeFilter(resumeDocs, plan.experienceScope);

  // Resolve linked projects for employment-only to surface associated work context.
  if (
    plan.experienceScope === 'employment_only' &&
    scopedResumeDocs.experiences.length > 0
  ) {
    const linkedProjectIds = new Set<string>();
    scopedResumeDocs.experiences.forEach((exp) => (exp.linkedProjects ?? []).forEach((id) => id && linkedProjectIds.add(id)));
    if (linkedProjectIds.size > 0) {
      const linkedProjects = await retrieval.getProjectsByIds(Array.from(linkedProjectIds));
      dedupProjects.push(...linkedProjects);
    }
  }

  const projectsWithLinks = dedupeById(dedupProjects, (p) => p.id);

  const result = {
    projects: projectsWithLinks,
    experiences: scopedResumeDocs.experiences,
    education: scopedResumeDocs.education,
    awards: scopedResumeDocs.awards,
    skills: scopedResumeDocs.skills,
    profile,
  };

  const retrievalFocus = inferRetrievalFocus(plan.retrievalRequests, plan.intent, plan.experienceScope, plan.resumeFacets);
  options?.logger?.('chat.pipeline.retrieval', {
    intent: plan.intent,
    retrievalFocus,
    enumerateAllRelevant: plan.enumerateAllRelevant,
    projectCount: projectsWithLinks.length,
    experienceCount: resumeDocs.experiences.length,
    educationCount: resumeDocs.education.length,
    awardCount: resumeDocs.awards.length,
    skillCount: resumeDocs.skills.length,
  });

  return { result, summaries: retrievalSummaries };
}

export function createChatRuntime(retrieval: RetrievalDrivers, options?: ChatRuntimeOptions) {
  const modelConfig = resolveModelConfig(options);
  const ownerId = options?.owner?.ownerId ?? options?.ownerId ?? 'default';
  const owner = options?.owner;
  const plannerModel = modelConfig.plannerModel;
  const stageReasoning = options?.modelConfig?.stageReasoning;
  const tokenLimits = options?.tokenLimits ?? {};
  const logger = options?.logger;
  const runtimePersona = options?.persona;
  const runtimeIdentity = options?.identityContext;
  const plannerCache = new Map<string, RetrievalPlan>();
  const retrievalCache: RetrievalCache = {
    projects: new Map(),
    resume: new Map(),
    profile: new Map(),
  };
  const buildPlannerCacheKey = (snippet: string, owner: string) => JSON.stringify({ ownerId: owner, snippet });

  const createAbortSignal = (runOptions?: RunChatPipelineOptions): { signal: AbortSignal; cleanup: () => void; timedOut: () => boolean } => {
    const controller = new AbortController();
    const parent = runOptions?.abortSignal;
    const timeoutMs = typeof runOptions?.softTimeoutMs === 'number' ? runOptions.softTimeoutMs : undefined;
    let timedOut = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    if (parent) {
      if (parent.aborted) {
        controller.abort(parent.reason);
      } else {
        const onAbort = () => controller.abort(parent.reason);
        parent.addEventListener('abort', onAbort, { once: true });
        controller.signal.addEventListener('abort', () => parent.removeEventListener('abort', onAbort));
      }
    }

    if (Number.isFinite(timeoutMs) && timeoutMs !== undefined && timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        controller.abort(new Error('soft_timeout'));
      }, timeoutMs);
    }

    const cleanup = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    };

    return { signal: controller.signal, cleanup, timedOut: () => timedOut };
  };

  async function planRetrieval(
    client: OpenAI,
    messages: ChatRequestMessage[],
    conversationSnippet: string,
    signal?: AbortSignal,
    maxTokens?: number,
    onUsage?: JsonResponseArgs<PlannerLLMOutput>['onUsage'],
    reasoning?: Reasoning
  ): Promise<RetrievalPlan> {
    const userText = extractUserText(messages);
    const userContent = [
      `Conversation:\n${conversationSnippet}`,
      '',
      `Latest user message: "${userText}"`,
      'Return ONLY the RetrievalPlan JSON.',
    ].join('\n');
    // Parse LLM output using PlannerLLMOutputSchema (per spec §4.2)
    const llmOutput = await runJsonResponse<PlannerLLMOutput>({
      client,
      model: plannerModel,
      systemPrompt: buildPlannerSystemPrompt(owner),
      userContent,
      schema: PlannerLLMOutputSchema,
      throwOnFailure: true,
      logger,
      usageStage: 'planner',
      responseFormatName: 'retrieval_plan',
      signal,
      maxTokens,
      onUsage,
      reasoning,
    });
    // Add derived fields (per spec §4.2 - answerMode and enumerateAllRelevant derived from intent)
    const derived = deriveFromIntent(llmOutput.intent);
    return {
      ...llmOutput,
      ...derived,
    };
  }

  async function summarizeEvidence(
    client: OpenAI,
    userMessage: string,
    _conversationSnippet: string,
    plan: RetrievalPlan,
    retrieved: RetrievalResult,
    model: string,
    signal?: AbortSignal,
    maxTokens?: number,
    onUsage?: JsonResponseArgs<EvidenceSummary>['onUsage'],
    reasoning?: Reasoning
  ): Promise<EvidenceSummary> {
    const userContent = buildEvidenceUserContent({ userMessage, plan, retrieved });
    return runJsonResponse<EvidenceSummary>({
      client,
      model,
      systemPrompt: buildEvidenceSystemPrompt(owner),
      userContent,
      schema: EvidenceSummarySchema,
      throwOnFailure: true,
      logger,
      usageStage: 'evidence',
      responseFormatName: 'evidence_summary',
      signal,
      maxTokens,
      onUsage,
      reasoning,
    });
  }

  type GenerateAnswerPayloadArgs = {
    client: OpenAI;
    userMessage: string;
    conversationSnippet: string;
    plan: RetrievalPlan;
    evidence: EvidenceSummary;
    retrieved: RetrievalResult;
    model: string;
    persona?: PersonaSummary;
    identityContext?: IdentityContext;
    owner?: OwnerConfig;
    onToken?: (delta: string) => void;
    signal?: AbortSignal;
    maxTokens?: number;
    onUsage?: JsonResponseArgs<AnswerPayload>['onUsage'];
    reasoning?: Reasoning;
  };

  async function generateAnswerPayload({
    client,
    userMessage,
    conversationSnippet,
    plan,
    evidence,
    retrieved,
    persona,
    identityContext,
    owner,
    model,
    onToken,
    signal,
    maxTokens,
    onUsage,
    reasoning,
  }: GenerateAnswerPayloadArgs): Promise<AnswerPayload> {
    const identityDetails = resolveIdentityDetails(retrieved.profile, persona, identityContext);
    const userContent = buildAnswerUserContent({
      userMessage,
      conversationSnippet,
      plan,
      evidence,
      identityDetails,
      persona,
    });
    const systemPrompt = buildAnswerSystemPrompt(persona, owner);
    const answer = await runStreamingJsonResponse<AnswerPayload>({
      client,
      model,
      systemPrompt,
      userContent,
      schema: AnswerPayloadSchema,
      throwOnFailure: true,
      logger,
      usageStage: 'answer',
      responseFormatName: 'answer_payload',
      signal,
      maxTokens,
      onTextDelta: onToken,
      onUsage,
      reasoning,
    });
    return answer;
  }

  return {
    async run(client: OpenAI, messages: ChatRequestMessage[], runOptions?: RunChatPipelineOptions): Promise<ChatbotResponse> {
      const tStart = performance.now();
      const timings: Record<string, number> = {};
      const effectiveOwnerId = runOptions?.ownerId ?? ownerId;
      const environment = process.env.NODE_ENV;
      const { signal: runSignal, cleanup: cleanupAborters, timedOut } = createAbortSignal(runOptions);
      const stageUsages: StageUsage[] = [];
      const recordUsage = (stage: string, model: string, usageRaw: unknown) => {
        if (!model) return;
        const parsed = parseUsage(usageRaw, { allowZero: true });
        if (!parsed) return;
        const costUsd = estimateCostUsd(model, parsed, { fallbackPricing: FALLBACK_NORMALIZED_PRICING });
        stageUsages.push({
          stage,
          model,
          usage: parsed,
          costUsd: typeof costUsd === 'number' && Number.isFinite(costUsd) ? costUsd : undefined,
        });
      };
      const buildStreamError = (
        code: ChatStreamError['code'],
        errorMessage: string,
        retryable: boolean
      ): ChatStreamError => ({
        code,
        message: errorMessage,
        retryable,
      });

      let windowedMessages: TruncationResult;
      try {
        windowedMessages = applySlidingWindow(messages);
      } catch (error) {
        cleanupAborters();
        if (error instanceof MessageTooLongError) {
          logger?.('chat.pipeline.error', { stage: 'window', error: formatLogValue(error) });
          return buildErrorResponse(
            error.message,
            stageUsages,
            buildStreamError('internal_error', error.message, false)
          );
        }
        throw error;
      }

      const boundedMessages = windowedMessages.messages.length ? windowedMessages.messages : messages.slice(-DEFAULT_MAX_CONTEXT);
      const userText = extractUserText(boundedMessages);
      const conversationSnippet = buildContextSnippet(boundedMessages);

      const truncationApplied = windowedMessages.truncated;
      const requestedReasoning = runOptions?.reasoningEnabled;
      const allowReasoning = Boolean(requestedReasoning);
      const reasoningEmitter =
        allowReasoning && typeof runOptions?.onReasoningUpdate === 'function' ? runOptions.onReasoningUpdate : null;
      let streamedReasoning: PartialReasoningTrace = buildPartialReasoningTrace();
      const emitReasoningUpdate = (stage: ReasoningStage, partial: PartialReasoningTrace) => {
        if (!reasoningEmitter) {
          return;
        }
        streamedReasoning = mergeReasoningTraces(streamedReasoning, partial);
        try {
          reasoningEmitter(stage, streamedReasoning);
        } catch (error) {
          logger?.('chat.pipeline.error', { stage: 'reasoning_emit', error: formatLogValue(error) });
        }
      };

      const stageEmitter = typeof runOptions?.onStageEvent === 'function' ? runOptions.onStageEvent : null;
      const emitStageEvent = (stage: PipelineStage, status: StageStatus, meta?: StageMeta, durationMs?: number) => {
        if (!stageEmitter) {
          return;
        }
        try {
          stageEmitter(stage, status, meta, durationMs);
        } catch (error) {
          logger?.('chat.pipeline.error', { stage: 'stage_emit', error: formatLogValue(error) });
        }
      };

      emitStageEvent('planner', 'start');
      // Emit early reasoning event so UI shows the reasoning panel in loading state
      emitReasoningUpdate('plan', buildPartialReasoningTrace());
      let plan: RetrievalPlan;
      try {
        const tPlan = performance.now();
        const plannerKey = buildPlannerCacheKey(conversationSnippet, effectiveOwnerId);
        const cachedPlan = plannerCache.get(plannerKey);
        let rawPlan: RetrievalPlan;
        let planSource: PlanNormalizationSource = 'planner';
        const plannerReasoning = resolveReasoningParams(plannerModel, allowReasoning, stageReasoning?.planner);
        if (cachedPlan) {
          logger?.('chat.cache.planner', { event: 'hit', key: plannerKey });
          rawPlan = cachedPlan;
          planSource = 'cache';
        } else {
          logger?.('chat.cache.planner', { event: 'miss', key: plannerKey });
          rawPlan = await planRetrieval(
            client,
            boundedMessages,
            conversationSnippet,
            runSignal,
            tokenLimits.planner,
            recordUsage,
            plannerReasoning
          );
        }
        plan = normalizeRetrievalPlan(rawPlan);
        logPlanNormalization(rawPlan, plan, logger, planSource);
        const cacheKeys = new Set<string>();
        cacheKeys.add(plannerKey);
        if (!cachedPlan) {
          for (const key of cacheKeys) {
            if (plannerCache.size >= 24) {
              const firstKey = plannerCache.keys().next().value;
              if (firstKey) {
                plannerCache.delete(firstKey);
              }
            }
            plannerCache.set(key, plan);
          }
        }
        timings.planMs = performance.now() - tPlan;
        emitStageEvent('planner', 'complete', { intent: plan.intent, topic: plan.topic }, timings.planMs);
      } catch (error) {
        cleanupAborters();
        logger?.('chat.pipeline.error', { stage: 'plan', error: formatLogValue(error) });
        const timeout = timedOut();
        const message = timeout
          ? 'I ran out of time planning—please try again.'
          : 'I hit an internal planning issue—please try again.';
        return buildErrorResponse(
          message,
          stageUsages,
          buildStreamError(timeout ? 'llm_timeout' : 'llm_error', message, true)
        );
      }

      emitReasoningUpdate('plan', buildPartialReasoningTrace({ plan }));

      const isMetaPlan = plan.intent === 'meta';
      let fastPathReason: 'no_docs' | 'meta' | null = isMetaPlan ? 'meta' : null;
      let evidenceModelUsed = isMetaPlan ? 'synthesized:meta' : modelConfig.evidenceModel;
      let retrieved: RetrievalResult = createEmptyRetrievalResult();
      let retrievalSummaries: RetrievalSummary[] = [];
      let evidenceDocs: RetrievalResult = retrieved;
      let forcedUiBanner: string | undefined;

      if (!isMetaPlan) {
        emitStageEvent('retrieval', 'start');
        let executedRetrieval: ExecutedRetrievalResult;
        try {
          const tRetrieval = performance.now();
          executedRetrieval = await executeRetrievalPlan(retrieval, plan, { logger, cache: retrievalCache, ownerId: effectiveOwnerId });
          timings.retrievalMs = performance.now() - tRetrieval;
        } catch (error) {
          cleanupAborters();
          logger?.('chat.pipeline.error', { stage: 'retrieval', error: formatLogValue(error) });
          const message = 'I hit an internal retrieval issue—please try again.';
          return buildErrorResponse(message, stageUsages, buildStreamError('retrieval_error', message, true));
        }
        retrieved = executedRetrieval.result;
        retrievalSummaries = executedRetrieval.summaries;
        evidenceDocs = limitEvidenceDocs(retrieved, plan);

        emitReasoningUpdate('retrieval', buildPartialReasoningTrace({ retrieval: retrievalSummaries }));

        const retrievalCounts = summarizeRetrievalResult(retrieved);
        const evidenceInputCounts = summarizeRetrievalResult(evidenceDocs);
        logger?.('chat.pipeline.retrieval.handoff', {
          retrieved: retrievalCounts,
          evidenceInput: evidenceInputCounts,
        });
        emitStageEvent(
          'retrieval',
          'complete',
          {
            docsFound: retrievalCounts.totalDocs,
            sources: retrievalSummaries.map((summary) => summary.source),
          },
          timings.retrievalMs
        );

        const evidenceDocCount =
          (evidenceDocs.projects?.length ?? 0) +
          (evidenceDocs.experiences?.length ?? 0) +
          (evidenceDocs.education?.length ?? 0) +
          (evidenceDocs.awards?.length ?? 0) +
          (evidenceDocs.skills?.length ?? 0) +
          (evidenceDocs.profile ? 1 : 0);

        evidenceModelUsed = selectEvidenceModel(plan, retrieved, modelConfig);
        const hasRetrievalRequests = Array.isArray(plan.retrievalRequests) && plan.retrievalRequests.length > 0;
        const allowNoDocFastPath = plan.intent !== 'meta' && plan.answerMode !== 'meta_chitchat';
        if (allowNoDocFastPath && hasRetrievalRequests && evidenceDocCount === 0) {
          fastPathReason = 'no_docs';
        }
      } else if (!retrieved.profile) {
        try {
          retrieved.profile = await retrieval.getProfileDoc();
        } catch (error) {
          logger?.('chat.pipeline.retrieval.profile_error', { error: formatLogValue(error) });
        }
      }

      emitStageEvent('evidence', 'start');
      let evidence: EvidenceSummary;
      try {
        const tEvidence = performance.now();
        const evidenceReasoning = resolveReasoningParams(evidenceModelUsed, allowReasoning, stageReasoning?.evidence);
        if (fastPathReason === 'meta') {
          evidence = synthesizeEvidenceSummary('meta');
        } else if (fastPathReason === 'no_docs') {
          evidence = synthesizeEvidenceSummary('no_docs');
          forcedUiBanner = ZERO_EVIDENCE_BANNER;
        } else {
          evidence = await summarizeEvidence(
            client,
            userText,
            conversationSnippet,
            plan,
            evidenceDocs,
            evidenceModelUsed,
            runSignal,
            tokenLimits.evidence,
            recordUsage,
            evidenceReasoning
          );
        }
        timings.evidenceMs = performance.now() - tEvidence;
        evidence = normalizeEvidenceSummaryPayload(plan, evidence, evidenceDocs, logger);
        emitStageEvent(
          'evidence',
          'complete',
          {
            highLevelAnswer: evidence.highLevelAnswer,
            evidenceCount: evidence.selectedEvidence.length,
          },
          timings.evidenceMs
        );
      } catch (error) {
        cleanupAborters();
        logger?.('chat.pipeline.error', { stage: 'evidence', error: formatLogValue(error) });
        const timeout = timedOut();
        const message = timeout
          ? 'I had to stop summarizing due to time—please ask again or narrow the question.'
          : 'I hit an internal parsing issue—please try again.';
        return buildErrorResponse(
          message,
          stageUsages,
          buildStreamError(timeout ? 'llm_timeout' : 'llm_error', message, true)
        );
      }

      emitReasoningUpdate(
        'evidence',
        buildPartialReasoningTrace({ evidence, uiHintWarnings: evidence.uiHintWarnings ?? null })
      );

      const projectMap = new Map(retrieved.projects.map((p) => [normalizeDocId(p.id), p]));
      const experienceMap = new Map(retrieved.experiences.map((e) => [normalizeDocId(e.id), e]));
      const educationMap = new Map(retrieved.education.map((e) => [normalizeDocId(e.id), e]));
      const awardMap = new Map(retrieved.awards.map((a) => [normalizeDocId(a.id), a]));
      const skillMap = new Map(retrieved.skills.map((s) => [normalizeDocId(s.id), s]));

      const resumeMaps: ResumeMaps = {
        experience: experienceMap,
        education: educationMap,
        award: awardMap,
        skill: skillMap,
      };

      const howIAnswered = summarizeSelectedEvidence(evidence);
      const ui = buildUiArtifacts({
        plan,
        evidence,
        projectMap,
        resumeMaps,
        retrieval: retrieved,
        bannerOverride: forcedUiBanner,
        logger,
      });
      if (runOptions?.onUiEvent) {
        try {
          runOptions.onUiEvent(ui);
        } catch (error) {
          logger?.('chat.pipeline.error', { stage: 'ui_emit', error: formatLogValue(error) });
        }
      }

      const answerModelUsed = modelConfig.answerModel;
      const tAnswer = performance.now();
      const answerReasoning = resolveReasoningParams(answerModelUsed, allowReasoning, stageReasoning?.answer);
      emitStageEvent('answer', 'start');
      let answer: AnswerPayload;
      try {
        answer = await generateAnswerPayload({
          client,
          userMessage: userText,
          conversationSnippet,
          plan,
          evidence,
          retrieved: evidenceDocs,
          model: answerModelUsed,
          persona: runtimePersona,
          identityContext: runtimeIdentity,
          owner,
          onToken: runOptions?.onAnswerToken,
          signal: runSignal,
          maxTokens: tokenLimits.answer,
          onUsage: recordUsage,
          reasoning: answerReasoning,
        });
      } catch (error) {
        cleanupAborters();
        logger?.('chat.pipeline.error', { stage: 'answer', error: formatLogValue(error) });
        const timeout = timedOut();
        const message = timeout
          ? 'I ran out of time while composing the answer—please ask again or request fewer details.'
          : 'I hit an internal parsing issue—please try again.';
        return buildErrorResponse(
          message,
          stageUsages,
          buildStreamError(timeout ? 'llm_timeout' : 'llm_error', message, true)
        );
      }
      timings.answerMs = performance.now() - tAnswer;
      cleanupAborters();
      const answerMessage = typeof answer.message === 'string' ? answer.message.trimEnd() : '';
      const answerThoughts = Array.isArray(answer.thoughts) && answer.thoughts.length ? answer.thoughts : undefined;
      const answerMeta: ReasoningTrace['answerMeta'] = {
        model: answerModelUsed,
        answerMode: plan.answerMode,
        answerLengthHint: plan.answerLengthHint,
        thoughts: answerThoughts,
      };

      emitReasoningUpdate('answer', buildPartialReasoningTrace({ answerMeta }));
      emitStageEvent(
        'answer',
        'complete',
        {
          tokenCount: answerMessage ? countTokens(answerMessage) : undefined,
        },
        performance.now() - tAnswer
      );

      // If answer model refined uiHints, rebuild UI with those hints
      let finalUi = ui;
      if (answer.uiHints && (answer.uiHints.projects.length > 0 || answer.uiHints.experiences.length > 0)) {
        const refinedEvidence: EvidenceSummary = {
          ...evidence,
          uiHints: answer.uiHints,
        };
        finalUi = buildUiArtifacts({
          plan,
          evidence: refinedEvidence,
          projectMap,
          resumeMaps,
          retrieval: retrieved,
          bannerOverride: forcedUiBanner,
          logger,
        });
        logger?.('chat.pipeline.answer.uiHintsRefined', {
          original: { projects: ui.showProjects.length, experiences: ui.showExperiences.length },
          refined: { projects: finalUi.showProjects.length, experiences: finalUi.showExperiences.length },
        });
      }

      const attachments = buildAttachmentPayloads(finalUi, projectMap, resumeMaps);

      logger?.('chat.pipeline.answer', {
        plan,
        evidence,
        ui: finalUi,
      });

      timings.totalMs = performance.now() - tStart;
      logger?.('chat.pipeline.timing', {
        ...timings,
        fastPath: Boolean(fastPathReason),
        streaming: Boolean(runOptions?.onAnswerToken),
        models: { planner: plannerModel, evidence: evidenceModelUsed, answer: answerModelUsed },
      });

      logPipelineSummary({
        logger,
        plan,
        rawRetrieval: retrieved,
        evidenceInput: evidenceDocs,
        evidence,
        howIAnswered,
        answerText: answerMessage,
        timings,
        models: { planner: plannerModel, evidence: evidenceModelUsed, answer: answerModelUsed },
        fastPath: fastPathReason,
        reasoning: requestedReasoning
          ? {
            requested: requestedReasoning,
            allowReasoning,
            environment,
          }
          : undefined,
      });

      const reasoningTrace: ReasoningTrace | undefined =
        allowReasoning
          ? {
            plan,
            retrieval: retrievalSummaries,
            evidence,
            answerMeta,
            uiHintWarnings: evidence.uiHintWarnings ?? [],
          }
          : undefined;

      const totalCostUsd =
        stageUsages.length > 0 ? stageUsages.reduce((acc, entry) => acc + (entry.costUsd ?? 0), 0) : undefined;
      if (stageUsages.length > 0) {
        logger?.('chat.pipeline.cost', { totalCostUsd, stages: stageUsages });
      }

      return {
        message: answerMessage,
        ui: finalUi,
        reasoningTrace,
        answerThoughts,
        attachments: attachments.length ? attachments : undefined,
        truncationApplied,
        usage: stageUsages.length ? stageUsages : undefined,
        totalCostUsd,
      };
    },
  };
}

function buildErrorResponse(message: string, usage?: StageUsage[], error?: ChatStreamError): ChatbotResponse {
  const totalCostUsd = usage?.reduce((acc, entry) => acc + (entry.costUsd ?? 0), 0);
  return {
    message,
    ui: { showProjects: [], showExperiences: [] },
    reasoningTrace: undefined,
    answerThoughts: undefined,
    truncationApplied: false,
    usage: usage && usage.length ? usage : undefined,
    totalCostUsd: usage && usage.length ? totalCostUsd : undefined,
    error: error ?? {
      code: 'internal_error',
      message,
      retryable: false,
    },
  };
}

function createEmptyRetrievalResult(): RetrievalResult {
  return {
    projects: [],
    experiences: [],
    education: [],
    awards: [],
    skills: [],
    profile: undefined,
  };
}

function dedupeById<T>(items: T[], getId: (item: T) => string): T[] {
  const seen = new Set<string>();
  const ordered: T[] = [];
  for (const item of items) {
    const key = getId(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    ordered.push(item);
  }
  return ordered;
}

function buildPartialReasoningTrace({
  plan,
  retrieval,
  evidence,
  answerMeta,
  uiHintWarnings,
  error,
}: {
  plan?: RetrievalPlan | null;
  retrieval?: RetrievalSummary[] | null;
  evidence?: EvidenceSummary | null;
  answerMeta?: ReasoningTrace['answerMeta'] | null;
  uiHintWarnings?: UiHintValidationWarning[] | null;
  error?: ReasoningTraceError | null;
} = {}): PartialReasoningTrace {
  return {
    plan: plan ?? null,
    retrieval: retrieval ?? null,
    evidence: evidence ?? null,
    answerMeta: answerMeta ?? null,
    uiHintWarnings: uiHintWarnings ?? null,
    error: error ?? null,
  };
}

function mergeReasoningTraces(
  current: PartialReasoningTrace,
  incoming: PartialReasoningTrace
): PartialReasoningTrace {
  return {
    plan: incoming.plan ?? current.plan ?? null,
    retrieval: incoming.retrieval ?? current.retrieval ?? null,
    evidence: incoming.evidence ?? current.evidence ?? null,
    answerMeta: incoming.answerMeta ?? current.answerMeta ?? null,
    uiHintWarnings: incoming.uiHintWarnings ?? current.uiHintWarnings ?? null,
    error: incoming.error ?? current.error ?? null,
  };
}

function synthesizeEvidenceSummary(reason: 'meta' | 'no_docs'): EvidenceSummary {
  if (reason === 'meta') {
    return {
      highLevelAnswer: 'not_applicable',
      evidenceCompleteness: 'none',
      reasoning: 'Meta or chit-chat turn; no evidence required.',
      selectedEvidence: [],
      semanticFlags: [],
      uiHints: { projects: [], experiences: [] },
      uiHintWarnings: [],
    };
  }

  return {
    highLevelAnswer: 'unknown',
    evidenceCompleteness: 'none',
    reasoning: 'No relevant documents were retrieved for this question.',
    selectedEvidence: [],
    semanticFlags: [{ type: 'off_topic', reason: 'No docs matched the query.' }],
    uiHints: { projects: [], experiences: [] },
    uiHintWarnings: [],
  };
}
