import type {
  AnswerPayload,
  AnswerUiHints,
  ChatRequestMessage,
  ModelConfig,
  OwnerConfig,
  PartialReasoningTrace,
  PersonaSummary,
  ReasoningEffort,
  ReasoningStage,
  ReasoningTrace,
  ReasoningTraceError,
  ReasoningUpdate,
  RetrievalPlan,
  RetrievalSummary,
  TokenUsage,
  UiPayload,
  ChatStreamError,
} from '@portfolio/chat-contract';
import {
  DEFAULT_CHAT_HISTORY_LIMIT,
  AnswerPayloadSchema,
  PlannerLLMOutputSchema,
  RETRIEVAL_REQUEST_TOPK_MAX,
  PlannerLLMOutput,
  parseUsage,
  estimateCostUsd,
  FALLBACK_NORMALIZED_PRICING,
} from '@portfolio/chat-contract';
import type OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { ResponseFormatTextJSONSchemaConfig } from 'openai/resources/responses/responses';
import type { Reasoning } from 'openai/resources/shared';
import { performance } from 'node:perf_hooks';
import { inspect } from 'node:util';
import { getEncoding } from 'js-tiktoken';
import { z } from 'zod';
import { answerSystemPrompt, plannerSystemPrompt } from '../pipelinePrompts';
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

// --- Types ---

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
    answer?: number;
  };
  persona?: PersonaSummary;
  identityContext?: IdentityContext;
  logger?: (event: string, payload: Record<string, unknown>) => void;
  logPrompts?: boolean;
};

export type PipelineStage = 'planner' | 'retrieval' | 'answer';
export type StageStatus = 'start' | 'complete';
export type StageMeta = {
  topic?: string | null;
  cardsEnabled?: boolean;
  docsFound?: number;
  sources?: RetrievalSummary['source'][];
  tokenCount?: number;
};

export type RunChatPipelineOptions = {
  onAnswerToken?: (delta: string) => void;
  abortSignal?: AbortSignal;
  softTimeoutMs?: number;
  onReasoningUpdate?: (update: ReasoningUpdate) => void;
  ownerId?: string;
  reasoningEnabled?: boolean;
  onStageEvent?: (stage: PipelineStage, status: StageStatus, meta?: StageMeta, durationMs?: number) => void;
  onUiEvent?: (ui: UiPayload) => void;
  logPrompts?: boolean;
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
  temperature?: number;
  onTextDelta?: (delta: string) => void;
};

// --- Constants ---

const DEFAULT_MAX_CONTEXT = DEFAULT_CHAT_HISTORY_LIMIT;
export const SLIDING_WINDOW_CONFIG = {
  maxConversationTokens: 8000,
  minRecentTurns: 3,
  maxUserMessageTokens: 500,
};
export type SlidingWindowConfig = typeof SLIDING_WINDOW_CONFIG;

const MAX_TOPK = RETRIEVAL_REQUEST_TOPK_MAX;
const DEFAULT_QUERY_LIMIT = 8;
const MAX_BODY_SNIPPET_CHARS = 480;
const PROJECT_BODY_SNIPPET_COUNT = 4;
const EXPERIENCE_BODY_SNIPPET_COUNT = 4;
const MAX_DISPLAY_ITEMS = 10;

// --- Utilities ---

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

export function buildAnswerSystemPrompt(persona?: PersonaSummary, owner?: OwnerConfig): string {
  const sections: string[] = [];

  if (persona?.voiceExamples?.length) {
    sections.push(
      ['## Voice Examples\nMatch this tone:', ...persona.voiceExamples.map((example) => `- ${example}`)].join('\n')
    );
  }

  sections.push(applyOwnerTemplate(answerSystemPrompt, owner));

  if (persona?.styleGuidelines?.length) {
    sections.push(['## Style Guidelines', ...persona.styleGuidelines.map((rule) => `- ${rule}`)].join('\n'));
  }

  return sections.join('\n\n');
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
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'symbol') return value.toString();
  if (value instanceof Error) {
    const summary = [value.name, value.message].filter(Boolean).join(': ') || 'Error';
    const stack = typeof value.stack === 'string' ? value.stack : '';
    const extraKeys = Object.keys(value).filter((key) => key !== 'name' && key !== 'message' && key !== 'stack');
    const errorRecord = value as unknown as Record<string, unknown>;
    const extras = extraKeys.length > 0 ? Object.fromEntries(extraKeys.map((key) => [key, errorRecord[key]])) : null;
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
        if (typeof val === 'bigint') return val.toString();
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

const normalizeModel = (value?: string) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

function normalizeTemperature(value?: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.min(2, Math.max(0, value));
}

function resolveModelConfig(options?: ChatRuntimeOptions): ModelConfig {
  const answerModel = normalizeModel(options?.modelConfig?.answerModel);
  const plannerModel = normalizeModel(options?.modelConfig?.plannerModel) ?? answerModel;
  const embeddingModel = normalizeModel(options?.modelConfig?.embeddingModel);
  const answerTemperature = normalizeTemperature(options?.modelConfig?.answerTemperature);
  const missing = [
    answerModel ? null : 'answerModel (models.answerModel)',
    plannerModel ? null : 'plannerModel (models.plannerModel)',
    embeddingModel ? null : 'embeddingModel (models.embeddingModel)',
  ].filter((item): item is string => Boolean(item));

  if (missing.length) {
    throw new Error(`Chat runtime requires modelConfig values. Missing: ${missing.join(', ')}`);
  }

  return {
    plannerModel: plannerModel!,
    answerModel: answerModel!,
    embeddingModel: embeddingModel!,
    answerTemperature,
    reasoning: options?.modelConfig?.reasoning,
  };
}

function resolveReasoningParams(model: string, allowReasoning: boolean, effort?: ReasoningEffort): Reasoning | undefined {
  if (!allowReasoning || !effort) return undefined;
  const normalizedModel = model.trim().toLowerCase();
  const isReasoningModel = normalizedModel.startsWith('gpt-5') || normalizedModel.startsWith('o');
  if (!isReasoningModel) return undefined;
  if (normalizedModel.includes('pro') && effort !== 'high') return undefined;
  return { effort };
}

function clampQueryLimit(value?: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.min(MAX_TOPK, Math.floor(value)));
  }
  return DEFAULT_QUERY_LIMIT;
}

// --- Model Runners ---

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
  temperature,
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
          ...(typeof temperature === 'number' && Number.isFinite(temperature) ? { temperature } : {}),
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
  onUsage,
  reasoning,
  temperature,
  onTextDelta,
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
  const normalizeEscapes = (s: string) => s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r').replace(/\\\\/g, '\\');
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
    if (!trimmedPrev || trimmedNext.length <= trimmedPrev.length) return trimmedNext;
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
    if (!match) return null;
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
          ...(typeof temperature === 'number' && Number.isFinite(temperature) ? { temperature } : {}),
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
          if (!onTextDelta || typeof message !== 'string' || !message.trim()) return;
          const sanitizedMessage = sanitizeMessageSnapshot(message, lastEmittedMessage);
          if (!sanitizedMessage) return;
          if (sanitizedMessage.length < lastEmittedMessage.length && lastEmittedMessage.startsWith(sanitizedMessage)) {
            return;
          }
          const prefix = sharedPrefixLength(sanitizedMessage, lastEmittedMessage);
          const delta = sanitizedMessage.slice(prefix);
          if (!delta || sanitizedMessage === lastEmittedMessage) return;
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
          if (!trimmed) return;

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
            if (!snapshot) return;
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

// --- Retrieval helpers ---

function normalizePlannerOutput(plan: PlannerLLMOutput): RetrievalPlan {
  const queries: RetrievalPlan['queries'] = Array.isArray(plan.queries)
    ? plan.queries
        .map((query) => ({
          source: query?.source,
          text: (query?.text ?? '').trim(),
          limit: clampQueryLimit(query?.limit),
        }))
        .filter((query) => query.source === 'projects' || query.source === 'resume' || query.source === 'profile')
    : [];

  const deduped: RetrievalPlan['queries'] = [];
  const seen = new Set<string>();
  for (const query of queries) {
    const key = `${query.source}:${query.text.toLowerCase()}:${query.limit ?? DEFAULT_QUERY_LIMIT}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(query);
  }

  return {
    queries: deduped,
    cardsEnabled: plan.cardsEnabled !== false,
    topic: plan.topic?.trim() || undefined,
  };
}

function dedupeById<T>(items: T[], getId: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const id = (getId(item) ?? '').trim().toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(item);
  }
  return result;
}

type ResumeMaps = {
  experience: Map<string, ExperienceDoc>;
  education: Map<string, EducationDoc>;
  award: Map<string, AwardDoc>;
  skill: Map<string, SkillDoc>;
};

type ResumeKind = keyof ResumeMaps;

function getResumeKind(doc: ResumeDoc): ResumeKind {
  if ('company' in doc) return 'experience';
  if ('institution' in doc) return 'education';
  if ('issuer' in doc) return 'award';
  return 'skill';
}

function splitResumeDocs(docs: ResumeDoc[]): ResumeMaps {
  const experience = new Map<string, ExperienceDoc>();
  const education = new Map<string, EducationDoc>();
  const award = new Map<string, AwardDoc>();
  const skill = new Map<string, SkillDoc>();

  docs.forEach((doc) => {
    const id = (doc.id ?? '').trim().toLowerCase();
    if (!id) return;
    const kind = getResumeKind(doc);
    if (kind === 'experience') experience.set(id, doc as ExperienceDoc);
    else if (kind === 'education') education.set(id, doc as EducationDoc);
    else if (kind === 'award') award.set(id, doc as AwardDoc);
    else skill.set(id, doc as SkillDoc);
  });

  return { experience, education, award, skill };
}

function normalizeDocId(id: string): string {
  return (id ?? '').trim().toLowerCase();
}

function executeRetrievalPlan(
  retrieval: RetrievalDrivers,
  plan: RetrievalPlan,
  options?: { logger?: ChatRuntimeOptions['logger']; cache?: RetrievalCache; ownerId?: string; onQueryResult?: (summary: RetrievalSummary) => void }
): Promise<ExecutedRetrievalResult> {
  const cache = options?.cache;
  const ownerKey = options?.ownerId ?? 'default';

  const fetchProjects = async (query: string, topK: number): Promise<ProjectDoc[]> => {
    const cacheKey = `${ownerKey}:${query}:${topK}`;
    if (cache?.projects.has(cacheKey)) {
      options?.logger?.('chat.pipeline.retrieval.cache', { source: 'projects', hit: true, key: cacheKey });
      return cache.projects.get(cacheKey) ?? [];
    }
    const results = await retrieval.searchProjectsByText(query, topK);
    cache?.projects.set(cacheKey, results);
    return results;
  };

  const fetchResume = async (query: string, topK: number): Promise<ResumeDoc[]> => {
    const cacheKey = `${ownerKey}:${query}:${topK}`;
    if (cache?.resume.has(cacheKey)) {
      options?.logger?.('chat.pipeline.retrieval.cache', { source: 'resume', hit: true, key: cacheKey });
      return cache.resume.get(cacheKey) ?? [];
    }
    const results = await retrieval.searchExperiencesByText(query, topK);
    cache?.resume.set(cacheKey, results);
    return results;
  };

  const fetchProfile = async (): Promise<ProfileDoc | undefined> => {
    const cacheKey = `${ownerKey}:profile`;
    if (cache?.profile?.has(cacheKey)) {
      options?.logger?.('chat.pipeline.retrieval.cache', { source: 'profile', hit: true, key: cacheKey });
      return cache.profile?.get(cacheKey) ?? undefined;
    }
    const profile = await retrieval.getProfileDoc();
    if (cache) {
      cache.profile = cache.profile ?? new Map();
      cache.profile.set(cacheKey, profile ?? null);
    }
    return profile;
  };

  return Promise.all(
    plan.queries.map(async (query) => {
      const topK = clampQueryLimit(query.limit);
      if (query.source === 'projects') {
        const results = await fetchProjects(query.text, topK);
        options?.onQueryResult?.({
          source: 'projects',
          queryText: query.text,
          requestedTopK: topK,
          effectiveTopK: topK,
          numResults: results.length,
        });
        return { projects: results, resumeDocs: [], profile: undefined } as const;
      }
      if (query.source === 'resume') {
        const results = await fetchResume(query.text, topK);
        options?.onQueryResult?.({
          source: 'resume',
          queryText: query.text,
          requestedTopK: topK,
          effectiveTopK: topK,
          numResults: results.length,
        });
        return { projects: [], resumeDocs: results, profile: undefined } as const;
      }
      const profile = await fetchProfile();
      options?.onQueryResult?.({
        source: 'profile',
        queryText: query.text,
        requestedTopK: 1,
        effectiveTopK: 1,
        numResults: profile ? 1 : 0,
      });
      return { projects: [], resumeDocs: [], profile } as const;
    })
  ).then((parts) => {
    const projects = dedupeById(
      parts.flatMap((p) => p.projects),
      (p) => p.id
    );
    const resumeDocs = dedupeById(parts.flatMap((p) => p.resumeDocs), (d) => d.id);
    const resumeSplit = splitResumeDocs(resumeDocs);
    const profile = parts.find((p) => p.profile)?.profile;

    const summaries: RetrievalSummary[] = plan.queries.map((query) => ({
      source: query.source,
      queryText: query.text,
      requestedTopK: clampQueryLimit(query.limit),
      effectiveTopK: clampQueryLimit(query.limit),
      numResults:
        query.source === 'projects'
          ? projects.length
          : query.source === 'resume'
            ? resumeDocs.length
            : profile
              ? 1
              : 0,
    }));

    return {
      result: {
        projects,
        experiences: Array.from(resumeSplit.experience.values()),
        education: Array.from(resumeSplit.education.values()),
        awards: Array.from(resumeSplit.award.values()),
        skills: Array.from(resumeSplit.skill.values()),
        profile,
      },
      summaries,
    };
  });
}

// --- Answer helpers ---

function buildAnswerUserContent(input: {
  userMessage: string;
  conversationSnippet: string;
  plan: RetrievalPlan;
  retrieved: RetrievalResult;
}): string {
  const { userMessage, conversationSnippet, plan, retrieved } = input;

  return [
    `## Conversation`,
    conversationSnippet,
    '',
    `## Latest Question`,
    userMessage,
    '',
    `## Retrieved Projects (${retrieved.projects.length})`,
    JSON.stringify(
      retrieved.projects.map((p) => ({
        id: p.id,
        name: p.name,
        oneLiner: p.oneLiner,
        techStack: p.techStack,
        bullets: p.bullets?.slice(0, PROJECT_BODY_SNIPPET_COUNT),
      })),
      null,
      2
    ),
    '',
    `## Retrieved Experiences (${retrieved.experiences.length})`,
    JSON.stringify(
      retrieved.experiences.map((e) => ({
        id: e.id,
        company: e.company,
        title: e.title,
        location: e.location,
        skills: e.skills,
        bullets: e.bullets?.slice(0, EXPERIENCE_BODY_SNIPPET_COUNT),
      })),
      null,
      2
    ),
    '',
    retrieved.profile ? `## Profile\n${JSON.stringify(retrieved.profile, null, 2)}` : '',
    '',
    `## Cards Enabled: ${plan.cardsEnabled !== false}`,
    plan.cardsEnabled !== false
      ? 'Include uiHints with relevant project/experience IDs.'
      : 'Do NOT include uiHints (no cards will be shown).',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildUi(uiHints: AnswerUiHints | undefined, retrieved: RetrievalResult, cardsEnabled: boolean): UiPayload {
  if (!cardsEnabled) {
    return { showProjects: [], showExperiences: [] };
  }

  const projectIds = new Set(retrieved.projects.map((p) => normalizeDocId(p.id)));
  const experienceIds = new Set(retrieved.experiences.map((e) => normalizeDocId(e.id)));

  const showProjects = (uiHints?.projects ?? [])
    .map(normalizeDocId)
    .filter((id) => id && projectIds.has(id))
    .slice(0, MAX_DISPLAY_ITEMS);

  const showExperiences = (uiHints?.experiences ?? [])
    .map(normalizeDocId)
    .filter((id) => id && experienceIds.has(id))
    .slice(0, MAX_DISPLAY_ITEMS);

  return { showProjects, showExperiences };
}

function resolveResumeEntry(resumeMaps: ResumeMaps, id: string): ResumeDoc | undefined {
  const normalized = normalizeDocId(id);
  return (
    resumeMaps.experience.get(normalized) ||
    resumeMaps.education.get(normalized) ||
    resumeMaps.award.get(normalized) ||
    resumeMaps.skill.get(normalized)
  );
}

function buildAttachmentPayloads(
  ui: UiPayload,
  projectMap: Map<string, ProjectDoc>,
  resumeMaps: ResumeMaps
): AttachmentPayload[] {
  const attachments: AttachmentPayload[] = [];

  const addProject = (id: string) => {
    const project = projectMap.get(normalizeDocId(id));
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
    attachments.push({ type: 'resume', id, data: { ...entry } });
  };

  ui.showProjects.forEach(addProject);
  ui.showExperiences.forEach(addResume);
  return attachments;
}

// --- Reasoning trace helpers ---

function buildPartialReasoningTrace(seed?: Partial<PartialReasoningTrace>): PartialReasoningTrace {
  return {
    plan: seed?.plan ?? null,
    retrieval: seed?.retrieval ?? null,
    answer: seed?.answer ?? null,
    error: seed?.error ?? null,
  };
}

function mergeReasoningTraces(current: PartialReasoningTrace, incoming: PartialReasoningTrace): PartialReasoningTrace {
  return {
    plan: incoming.plan ?? current.plan,
    retrieval: incoming.retrieval ?? current.retrieval,
    answer: incoming.answer ?? current.answer,
    error: incoming.error ?? current.error,
  };
}

function buildErrorTrace(stage: ReasoningStage, error: Error): PartialReasoningTrace {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const traceError: ReasoningTraceError = {
    stage,
    message,
    code: 'internal_error',
    retryable: true,
  };
  return buildPartialReasoningTrace({ error: traceError });
}

// --- Runtime ---

function createAbortSignal(runOptions?: RunChatPipelineOptions): { signal: AbortSignal; cleanup: () => void; timedOut: () => boolean } {
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
}

export function createChatRuntime(retrieval: RetrievalDrivers, options?: ChatRuntimeOptions) {
  const modelConfig = resolveModelConfig(options);
  const ownerId = options?.owner?.ownerId ?? options?.ownerId ?? 'default';
  const owner = options?.owner;
  const plannerModel = modelConfig.plannerModel;
  const answerModel = modelConfig.answerModel;
  const stageReasoning = options?.modelConfig?.reasoning;
  const tokenLimits = options?.tokenLimits ?? {};
  const logger = options?.logger;
  const runtimePersona = options?.persona;
  const baseLogPrompts = options?.logPrompts ?? false;
  const plannerCache = new Map<string, RetrievalPlan>();
  const retrievalCache: RetrievalCache = {
    projects: new Map(),
    resume: new Map(),
    profile: new Map(),
  };
  const buildPlannerCacheKey = (snippet: string, ownerKey: string) => JSON.stringify({ ownerId: ownerKey, snippet });

  const createReasoningEmitter = (runOptions?: RunChatPipelineOptions) => {
    const allowReasoning = Boolean(runOptions?.reasoningEnabled && runOptions?.onReasoningUpdate);
    let streamedReasoning: PartialReasoningTrace = buildPartialReasoningTrace();
    const emit = (update: ReasoningUpdate) => {
      if (!allowReasoning || !runOptions?.onReasoningUpdate) return;
      streamedReasoning = mergeReasoningTraces(streamedReasoning, update.trace ?? buildPartialReasoningTrace());
      runOptions.onReasoningUpdate({ ...update, trace: streamedReasoning });
    };
    return { emit };
  };

  return {
    async run(client: OpenAI, messages: ChatRequestMessage[], runOptions?: RunChatPipelineOptions): Promise<ChatbotResponse> {
      const tStart = performance.now();
      const timings: Record<string, number> = {};
      const effectiveOwnerId = runOptions?.ownerId ?? ownerId;
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
      const logPrompts = runOptions?.logPrompts ?? baseLogPrompts;
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
          return {
            message: '',
            ui: { showProjects: [], showExperiences: [] },
            usage: stageUsages,
            error: buildStreamError('internal_error', error.message, false),
          };
        }
        throw error;
      }

      const boundedMessages = windowedMessages.messages.length ? windowedMessages.messages : messages.slice(-DEFAULT_MAX_CONTEXT);
      const userText = extractUserText(boundedMessages);
      const conversationSnippet = buildContextSnippet(boundedMessages);
      const truncationApplied = windowedMessages.truncated;

      const reasoningEmitter = createReasoningEmitter(runOptions);
      const stageEmitter = typeof runOptions?.onStageEvent === 'function' ? runOptions.onStageEvent : null;
      const emitStageEvent = (stage: PipelineStage, status: StageStatus, meta?: StageMeta, durationMs?: number) => {
        if (!stageEmitter) return;
        try {
          stageEmitter(stage, status, meta, durationMs);
        } catch (error) {
          logger?.('chat.pipeline.error', { stage: 'stage_emit', error: formatLogValue(error) });
        }
      };

      const emitReasoning = (update: ReasoningUpdate) => {
        reasoningEmitter.emit(update);
      };

      const plannerKey = buildPlannerCacheKey(conversationSnippet, effectiveOwnerId);
      emitStageEvent('planner', 'start');
      emitReasoning({ stage: 'planner', notes: 'Planning retrieval...' });

      let plan: RetrievalPlan;
      try {
        const tPlan = performance.now();
        const cachedPlan = plannerCache.get(plannerKey);
        let rawPlan: RetrievalPlan;
        const plannerReasoning = resolveReasoningParams(plannerModel, Boolean(runOptions?.reasoningEnabled), stageReasoning?.planner);
        if (cachedPlan) {
          logger?.('chat.cache.planner', { event: 'hit', key: plannerKey });
          rawPlan = cachedPlan;
        } else {
          logger?.('chat.cache.planner', { event: 'miss', key: plannerKey });
          const userContent = [
            `Conversation:\n${conversationSnippet}`,
            '',
            `Latest user message: "${userText}"`,
            'Return ONLY the RetrievalPlan JSON.',
          ].join('\n');
          const systemPrompt = buildPlannerSystemPrompt(owner);
          if (logPrompts) {
            logger?.('chat.pipeline.prompt', {
              stage: 'planner',
              model: plannerModel,
              systemPrompt,
              userContent,
            });
          }
          const plannerOutput = await runStreamingJsonResponse<PlannerLLMOutput>({
            client,
            model: plannerModel,
            systemPrompt,
            userContent,
            schema: PlannerLLMOutputSchema,
            throwOnFailure: true,
            logger,
            usageStage: 'planner',
            responseFormatName: 'retrieval_plan',
            signal: runSignal,
            maxTokens: tokenLimits.planner,
            onUsage: recordUsage,
            reasoning: plannerReasoning,
            onTextDelta: (delta) => {
              emitReasoning({ stage: 'planner', delta });
            },
          });
          rawPlan = normalizePlannerOutput(plannerOutput);
          if (!cachedPlan) {
            plannerCache.set(plannerKey, rawPlan);
          }
        }
        plan = normalizePlannerOutput(rawPlan);
        timings.planMs = performance.now() - tPlan;
        emitStageEvent('planner', 'complete', { topic: plan.topic ?? null, cardsEnabled: plan.cardsEnabled }, timings.planMs);
      } catch (error) {
        cleanupAborters();
        logger?.('chat.pipeline.error', { stage: 'plan', error: formatLogValue(error) });
        const timeout = timedOut();
        const message = timeout ? 'I ran out of time planning—please try again.' : 'I hit a planning issue—please try again.';
        emitReasoning(buildErrorTrace('planner', error as Error));
        return {
          message: '',
          ui: { showProjects: [], showExperiences: [] },
          usage: stageUsages,
          error: buildStreamError(timeout ? 'llm_timeout' : 'llm_error', message, true),
        };
      }

      emitReasoning({ stage: 'planner', trace: buildPartialReasoningTrace({ plan }) });

      emitStageEvent('retrieval', 'start');
      emitReasoning({ stage: 'retrieval', notes: 'Running portfolio searches...' });
      let retrieved: RetrievalResult;
      let retrievalSummaries: RetrievalSummary[];
      try {
        const tRetrieval = performance.now();
        const executed = await executeRetrievalPlan(retrieval, plan, {
          logger,
          cache: retrievalCache,
          ownerId: effectiveOwnerId,
          onQueryResult: (summary) => emitReasoning({ stage: 'retrieval', notes: `${summary.source}: ${summary.numResults} results` }),
        });
        retrieved = executed.result;
        retrievalSummaries = executed.summaries;
        timings.retrievalMs = performance.now() - tRetrieval;
        emitStageEvent(
          'retrieval',
          'complete',
          { docsFound: retrieved.projects.length + retrieved.experiences.length + (retrieved.profile ? 1 : 0), sources: retrievalSummaries.map((r) => r.source) },
          timings.retrievalMs
        );
      } catch (error) {
        cleanupAborters();
        logger?.('chat.pipeline.error', { stage: 'retrieval', error: formatLogValue(error) });
        emitReasoning(buildErrorTrace('retrieval', error as Error));
        return {
          message: '',
          ui: { showProjects: [], showExperiences: [] },
          usage: stageUsages,
          error: buildStreamError('retrieval_error', 'I hit an internal retrieval issue—please try again.', true),
        };
      }

      emitReasoning({ stage: 'retrieval', trace: buildPartialReasoningTrace({ retrieval: retrievalSummaries }) });

      emitStageEvent('answer', 'start');
      emitReasoning({ stage: 'answer', notes: 'Drafting answer...' });

      const userContent = buildAnswerUserContent({
        userMessage: userText,
        conversationSnippet,
        plan,
        retrieved,
      });
      const systemPrompt = buildAnswerSystemPrompt(runtimePersona, owner);
      if (logPrompts) {
        logger?.('chat.pipeline.prompt', {
          stage: 'answer',
          model: answerModel,
          systemPrompt,
          userContent,
        });
      }

      const answerReasoning = resolveReasoningParams(answerModel, Boolean(runOptions?.reasoningEnabled), stageReasoning?.answer);
      let answer: AnswerPayload;
      try {
        answer = await runStreamingJsonResponse<AnswerPayload>({
          client,
          model: answerModel,
          systemPrompt,
          userContent,
          schema: AnswerPayloadSchema,
          throwOnFailure: true,
          logger,
          usageStage: 'answer',
          responseFormatName: 'answer_payload',
          signal: runSignal,
          maxTokens: tokenLimits.answer,
          onTextDelta: (delta) => {
            runOptions?.onAnswerToken?.(delta);
            emitReasoning({ stage: 'answer', delta });
          },
          onUsage: recordUsage,
          reasoning: answerReasoning,
          temperature: modelConfig.answerTemperature,
        });
      } catch (error) {
        cleanupAborters();
        logger?.('chat.pipeline.error', { stage: 'answer', error: formatLogValue(error) });
        emitReasoning(buildErrorTrace('answer', error as Error));
        const timeout = timedOut();
        return {
          message: '',
          ui: { showProjects: [], showExperiences: [] },
          usage: stageUsages,
          error: buildStreamError(timeout ? 'llm_timeout' : 'llm_error', 'I had trouble generating a reply—please try again.', true),
        };
      }

      const ui = buildUi(answer.uiHints, retrieved, plan.cardsEnabled !== false);
      try {
        runOptions?.onUiEvent?.(ui);
      } catch (error) {
        logger?.('chat.pipeline.error', { stage: 'ui_emit', error: formatLogValue(error) });
      }

      const projectMap = new Map(retrieved.projects.map((p) => [normalizeDocId(p.id), p]));
      const resumeMaps: ResumeMaps = splitResumeDocs([...retrieved.experiences, ...retrieved.education, ...retrieved.awards, ...retrieved.skills]);
      const attachments = buildAttachmentPayloads(ui, projectMap, resumeMaps);

      const reasoningTrace: ReasoningTrace = {
        plan,
        retrieval: retrievalSummaries,
        answer: {
          model: answerModel,
          uiHints: answer.uiHints,
          thoughts: answer.thoughts,
        },
      };

      emitReasoning({
        stage: 'answer',
        trace: buildPartialReasoningTrace({ answer: reasoningTrace.answer }),
      });

      timings.totalMs = performance.now() - tStart;

      return {
        message: answer.message,
        ui,
        answerThoughts: answer.thoughts,
        attachments: attachments.length ? attachments : undefined,
        reasoningTrace,
        truncationApplied,
        usage: stageUsages,
        totalCostUsd: stageUsages.reduce((sum, entry) => sum + (entry.costUsd ?? 0), 0),
      };
    },
  };
}
