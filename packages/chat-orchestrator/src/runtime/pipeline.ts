import type {
  AnswerPayload,
  AnswerUiHints,
  CardSelectionReasoning,
  ChatRequestMessage,
  ModelConfig,
  PartialReasoningTrace,
  PersonaSummary,
  ReasoningEffort,
  ReasoningStage,
  ReasoningTrace,
  ReasoningTraceError,
  ReasoningUpdate,
  RetrievalDocs,
  RetrievalPlan,
  RetrievalSummary,
  RetrievedProjectDoc,
  RetrievedResumeDoc,
  TokenUsage,
  UiPayload,
  ChatStreamError,
  SocialPlatform,
  ProfileSummary,
} from '@portfolio/chat-contract';
import {
  DEFAULT_CHAT_HISTORY_LIMIT,
  AnswerPayloadSchema,
  PlannerLLMOutputSchema,
  RETRIEVAL_REQUEST_TOPK_MAX,
  RETRIEVAL_REQUEST_TOPK_DEFAULT,
  PlannerLLMOutput,
  parseUsage,
  estimateCostUsd,
} from '@portfolio/chat-contract';
import type { JsonSchema, LlmClient } from '@portfolio/chat-llm';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { Reasoning } from 'openai/resources/shared';
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
import { buildPartialReasoningTrace, mergeReasoningTraces } from './reasoningMerge';

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

type ProfileContext = {
  fullName?: string;
  headline?: string;
  domainLabel?: string;
  currentLocation?: string;
  currentRole?: string;
  shortAbout?: string;
  topSkills?: string[];
  socialLinks?: Array<{ platform?: string; url?: string; blurb?: string | null }>;
  featuredExperienceIds?: string[];
  retrievalTriggers?: string[];
};

export type ChatRuntimeOptions = {
  modelConfig?: Partial<ModelConfig>;
  tokenLimits?: {
    planner?: number;
    answer?: number;
  };
  retrieval?: {
    minRelevanceScore?: number;
  };
  persona?: PersonaSummary;
  profile?: ProfileSummary;
  logger?: (event: string, payload: Record<string, unknown>) => void;
  logPrompts?: boolean;
};

export type PipelineStage = 'planner' | 'retrieval' | 'answer';
export type StageStatus = 'start' | 'complete';
export type StageMeta = {
  topic?: string | null;
  docsFound?: number;
  sources?: RetrievalSummary['source'][];
  tokenCount?: number;
};

export type RunChatPipelineOptions = {
  onAnswerToken?: (delta: string) => void;
  abortSignal?: AbortSignal;
  softTimeoutMs?: number;
  onReasoningUpdate?: (update: ReasoningUpdate) => void;
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
  client: LlmClient;
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
  onRawResponse?: (raw: string) => void;
  onParsedDelta?: (candidate: unknown) => void;
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
const DEFAULT_QUERY_LIMIT = RETRIEVAL_REQUEST_TOPK_DEFAULT;
const MIN_QUERY_LIMIT = 3;
const MAX_BODY_SNIPPET_CHARS = 480;
const PROJECT_BODY_SNIPPET_COUNT = 4;
const EXPERIENCE_BODY_SNIPPET_COUNT = 4;
const MAX_DISPLAY_ITEMS = 10;
const DEFAULT_MIN_RELEVANCE_SCORE = 0.5; // 50% of top normalized score
const UiHintsSchema = AnswerPayloadSchema.shape.uiHints;

// --- Utilities ---

function _extractResponseOutputText(response: { output_text?: string; output?: unknown[] } | null | undefined): string {
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

function _extractResponseParsedContent(response: { output?: unknown[] } | null | undefined): unknown {
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

function tryParseJsonLoose(raw: string): unknown | undefined {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function repairJsonLikeSnapshot(raw: string): string | null {
  const start = raw.indexOf('{');
  const candidate = start === -1 ? raw : raw.slice(start);
  let value = candidate.trim();
  if (!value) return null;

  // Strip trailing comma when it appears outside of a string
  let inString = false;
  let escape = false;
  for (let i = value.length - 1; i >= 0; i -= 1) {
    const ch = value[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (ch === ',') {
      value = value.slice(0, i) + value.slice(i + 1);
      break;
    }
    if (ch !== ' ' && ch !== '\n' && ch !== '\r' && ch !== '\t') {
      break;
    }
  }

  // Balance braces/brackets and close a hanging string so the snapshot is parseable
  const stack: string[] = [];
  inString = false;
  escape = false;
  for (const ch of value) {
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{' || ch === '[') {
      stack.push(ch);
    } else if (ch === '}' || ch === ']') {
      const top = stack[stack.length - 1];
      if ((ch === '}' && top === '{') || (ch === ']' && top === '[')) {
        stack.pop();
      }
    }
  }

  if (inString) {
    value += '"';
  }
  while (stack.length) {
    const opener = stack.pop()!;
    value += opener === '{' ? '}' : ']';
  }
  return value;
}

function parseStreamingJsonCandidate(snapshot: string): unknown | undefined {
  const block = extractFirstJsonBlock(snapshot) ?? snapshot;
  const parsed = tryParseJsonLoose(block);
  if (typeof parsed !== 'undefined') {
    return parsed;
  }
  const repaired = repairJsonLikeSnapshot(block);
  if (!repaired) return undefined;
  return tryParseJsonLoose(repaired);
}

const DEFAULT_PROFILE_IDENTITY = {
  fullName: 'Portfolio Owner',
  domainLabel: 'portfolio owner',
};

function applyProfileTemplate(prompt: string, profileContext?: ProfileContext): string {
  const ownerName = profileContext?.fullName?.trim() || DEFAULT_PROFILE_IDENTITY.fullName;
  const domainLabel = profileContext?.domainLabel?.trim() || profileContext?.headline?.trim() || DEFAULT_PROFILE_IDENTITY.domainLabel;
  const retrievalTopics = profileContext?.retrievalTriggers?.length
    ? profileContext.retrievalTriggers.join(', ')
    : 'your background, locations, experiences, resume, skills, etc.';

  return prompt
    .replace(/{{OWNER_NAME}}/g, ownerName)
    .replace(/{{DOMAIN_LABEL}}/g, domainLabel)
    .replace(/{{RETRIEVAL_TOPICS}}/g, retrievalTopics);
}

function formatProfileContextForPrompt(profileContext?: ProfileContext): string {
  if (!profileContext) return '';
  const lines: string[] = [];
  if (profileContext.fullName) lines.push(`- Name: ${profileContext.fullName}`);
  if (profileContext.headline) lines.push(`- Headline: ${profileContext.headline}`);
  if (profileContext.currentLocation) lines.push(`- Location: ${profileContext.currentLocation}`);
  if (profileContext.currentRole) lines.push(`- Current Role: ${profileContext.currentRole}`);
  if (profileContext.shortAbout) lines.push(`- About: ${profileContext.shortAbout}`);
  if (profileContext.topSkills?.length) lines.push(`- Top Skills: ${profileContext.topSkills.join(', ')}`);
  if (profileContext.socialLinks?.length) {
    const platforms = profileContext.socialLinks
      .map((link) => link.platform)
      .filter(Boolean)
      .join(', ');
    if (platforms) lines.push(`- Social Platforms: ${platforms}`);
  }
  return lines.length ? ['## Profile Context', ...lines].join('\n') : '';
}

export function buildPlannerSystemPrompt(profileContext?: ProfileContext): string {
  const base = applyProfileTemplate(plannerSystemPrompt, profileContext);
  const profileSection = formatProfileContextForPrompt(profileContext);
  return profileSection ? `${base}\n\n${profileSection}` : base;
}

export function buildAnswerSystemPrompt(
  persona?: PersonaSummary,
  profileContext?: ProfileContext
): string {
  const sections: string[] = [];

  if (persona?.systemPersona?.trim()) {
    sections.push(`## System Persona\n${persona.systemPersona.trim()}`);
  }

  if (persona?.voiceExamples?.length) {
    sections.push(
      [
        '## Voice Examples',
        'Match this voice/tone as closely as possible.',
        ...persona.voiceExamples.map((example) => `- ${example}`),
      ].join('\n')
    );
  }

  sections.push(applyProfileTemplate(answerSystemPrompt, profileContext));

  if (persona?.styleGuidelines?.length) {
    sections.push(['## Style Guidelines', ...persona.styleGuidelines.map((rule) => `- ${rule}`)].join('\n'));
  }

  const profileSection = formatProfileContextForPrompt(profileContext);
  if (profileSection) {
    sections.push(profileSection);
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
    return String(value);
  }
}

function normalizeSnippet(text?: string | null, maxChars = MAX_BODY_SNIPPET_CHARS): string | undefined {
  if (!text) return undefined;
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  return normalized.length > maxChars ? normalized.slice(0, maxChars) : normalized;
}


function sanitizeProfileContext(profile?: ProfileContext): ProfileContext | undefined {
  if (!profile) return undefined;
  const sanitized: ProfileContext = {
    fullName: profile.fullName,
    headline: profile.headline,
    domainLabel: profile.domainLabel,
    currentLocation: profile.currentLocation,
    currentRole: profile.currentRole,
    shortAbout: profile.shortAbout,
    topSkills: profile.topSkills?.filter(Boolean).slice(0, 12),
    socialLinks: profile.socialLinks
      ?.filter((link) => link?.url)
      .map((link) => ({
        platform: link.platform,
        url: link.url,
        blurb: link.blurb,
      })),
    featuredExperienceIds: profile.featuredExperienceIds?.filter(Boolean),
    retrievalTriggers: profile.retrievalTriggers?.filter(Boolean),
  };
  const hasData = Object.values(sanitized).some((value) => {
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return Boolean(value);
  });
  return hasData ? sanitized : undefined;
}

function buildProfileContext(profile?: ProfileSummary, persona?: PersonaSummary): ProfileContext | undefined {
  const personaProfile = persona?.profile;
  const candidate: ProfileContext = {
    fullName: profile?.fullName ?? personaProfile?.fullName,
    headline: profile?.headline ?? personaProfile?.headline,
    domainLabel: profile?.domainLabel ?? profile?.headline ?? personaProfile?.headline,
    currentLocation: profile?.currentLocation ?? personaProfile?.currentLocation,
    currentRole: profile?.currentRole ?? personaProfile?.currentRole,
    shortAbout: profile?.shortAbout,
    topSkills: profile?.topSkills?.length ? profile.topSkills : personaProfile?.topSkills,
    socialLinks: (profile?.socialLinks as ProfileContext['socialLinks']) ?? personaProfile?.socialLinks,
    featuredExperienceIds: personaProfile?.featuredExperienceIds,
    retrievalTriggers: profile?.retrievalTriggers,
  };
  return sanitizeProfileContext(candidate);
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
  const answerModelNoRetrieval = normalizeModel(options?.modelConfig?.answerModelNoRetrieval);
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
    answerModelNoRetrieval: answerModelNoRetrieval,
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

function coerceReasoningEffort(value?: unknown): ReasoningEffort | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized === 'none' || normalized === 'minimal' || normalized === 'low' || normalized === 'medium' || normalized === 'high'
    ? (normalized as ReasoningEffort)
    : undefined;
}

function clampQueryLimit(_value?: number | null): number {
  const parsed = typeof _value === 'number' && Number.isFinite(_value) ? Math.floor(_value) : DEFAULT_QUERY_LIMIT;
  if (parsed <= 0) return DEFAULT_QUERY_LIMIT;
  return Math.max(MIN_QUERY_LIMIT, Math.min(MAX_TOPK, parsed));
}

function sanitizePlannerQueryText(text: string): string {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return '';
  const stripped = trimmed.replace(/\b(projects?|experiences?|experience|resume)\b/gi, '').replace(/\s+/g, ' ').trim();
  return stripped.length ? stripped : trimmed;
}

function trimRetrievedDocs(result: RetrievalResult, maxTotal: number): RetrievalResult {
  let total =
    result.projects.length +
    result.experiences.length +
    result.education.length +
    result.awards.length +
    result.skills.length;

  if (total <= maxTotal) {
    return result;
  }

  const buckets: Array<{ key: keyof RetrievalResult; items: unknown[] }> = [
    { key: 'projects', items: result.projects },
    { key: 'experiences', items: result.experiences },
    { key: 'education', items: result.education },
    { key: 'awards', items: result.awards },
    { key: 'skills', items: result.skills },
  ];

  while (total > maxTotal) {
    const largest = buckets
      .filter((bucket) => bucket.items.length > 0)
      .sort((a, b) => b.items.length - a.items.length)[0];
    if (!largest) break;
    largest.items.pop();
    total -= 1;
  }

  return {
    ...result,
    projects: buckets[0]!.items as ProjectDoc[],
    experiences: buckets[1]!.items as ExperienceDoc[],
    education: buckets[2]!.items as EducationDoc[],
    awards: buckets[3]!.items as AwardDoc[],
    skills: buckets[4]!.items as SkillDoc[],
  };
}

function filterByRelevanceScore(result: RetrievalResult, minScore: number): RetrievalResult {
  const passesThreshold = <T extends { _score?: number }>(doc: T): boolean => (doc._score ?? 0) >= minScore;

  return {
    ...result,
    projects: result.projects.filter(passesThreshold),
    experiences: result.experiences.filter(passesThreshold),
    education: result.education.filter(passesThreshold),
    awards: result.awards.filter(passesThreshold),
    skills: result.skills.filter(passesThreshold),
  };
}

// --- Model Runners ---

async function _runJsonResponse<T>({
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
  const responseFormatNameValue = responseFormatName ?? usageStage ?? 'json_payload';
  const responseFormat = zodResponseFormat(schema, responseFormatNameValue);
  const responseFormatJsonSchema = (
    responseFormat as {
      json_schema?: { name?: string; schema?: Record<string, unknown>; description?: string; strict?: boolean };
    }
  ).json_schema;
  const jsonSchemaFormat: JsonSchema = {
    type: 'json_schema',
    name: responseFormatJsonSchema?.name ?? responseFormatNameValue,
    schema: responseFormatJsonSchema?.schema ?? {},
    description: responseFormatJsonSchema?.description,
    strict: responseFormatJsonSchema?.strict ?? true,
  };
  const stageLabel = usageStage ?? 'json_response';

  while (attempt < maxAttempts) {
    attempt += 1;
    logger?.('chat.pipeline.model.request', {
      stage: stageLabel,
      model,
      attempt,
      reasoning: reasoning ?? null,
      maxTokens: maxTokens ?? null,
      provider: client.provider,
    });
    try {
      const result = await client.createStructuredJson({
        model,
        systemPrompt,
        userContent,
        jsonSchema: jsonSchemaFormat,
        maxOutputTokens:
          typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0 ? Math.floor(maxTokens) : undefined,
        temperature: typeof temperature === 'number' && Number.isFinite(temperature) ? temperature : undefined,
        openAiReasoning: reasoning,
        signal,
        stage: stageLabel,
        logger: logger ?? undefined,
      });

      const usage = result.usage;
      if (usage) {
        logger?.('chat.pipeline.tokens', { stage: stageLabel, model, attempt, usage });
        onUsage?.(stageLabel, model, usage);
      }

      const rawContent = (result.rawText ?? '').trim();
      const structuredCandidate = result.structured;
      logger?.('chat.pipeline.model.raw', { stage: stageLabel, model, raw: rawContent, attempt });

      let candidate: unknown = typeof structuredCandidate !== 'undefined' ? structuredCandidate : undefined;
      let parsedFrom: 'structured' | 'text' | undefined =
        typeof structuredCandidate !== 'undefined' ? 'structured' : undefined;

      if (typeof candidate === 'undefined') {
        const trimmedContent = rawContent.trim();
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
            raw: rawContent.slice(0, 2000),
            error: formatLogValue(parseError ?? 'unknown'),
            attempt,
          });
          continue;
        }
      }

      const validated = schema.safeParse(candidate);
      if (!validated.success) {
        lastError = validated.error.issues;
        logger?.('chat.pipeline.model.validation_error', { stage: stageLabel, model, attempt, issues: validated.error.issues });
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
    } catch (error) {
      lastError = error;
      logger?.('chat.pipeline.model.error', { stage: stageLabel, model, error: formatLogValue(error), attempt });
      continue;
    }
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
  onRawResponse,
  onParsedDelta,
}: JsonResponseArgs<T>): Promise<T> {
  let attempt = 0;
  let lastError: unknown = null;
  const responseFormatNameValue = responseFormatName ?? usageStage ?? 'json_payload';
  const responseFormat = zodResponseFormat(schema, responseFormatNameValue);
  const responseFormatJsonSchema = (
    responseFormat as {
      json_schema?: { name?: string; schema?: Record<string, unknown>; description?: string; strict?: boolean };
    }
  ).json_schema;
  const jsonSchemaFormat: JsonSchema = {
    type: 'json_schema',
    name: responseFormatJsonSchema?.name ?? responseFormatNameValue,
    schema: responseFormatJsonSchema?.schema ?? {},
    description: responseFormatJsonSchema?.description,
    strict: responseFormatJsonSchema?.strict ?? true,
  };
  const stageLabel = usageStage ?? 'json_response';
  const effectiveMaxAttempts = onTextDelta ? 1 : maxAttempts;
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

  while (attempt < effectiveMaxAttempts) {
    attempt += 1;
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
      provider: client.provider,
    });
    try {
      if (signal) {
        abortListener = () => {
          // Best-effort: provider clients use AbortSignal for cancellation.
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
      }

      const handleTextSnapshot = (snapshot: string) => {
        streamedText = snapshot;
        const trimmed = streamedText.trim();
        if (!trimmed) return;

        const parsedCandidate = parseStreamingJsonCandidate(trimmed);
        if (typeof parsedCandidate !== 'undefined') {
          streamedParsed = parsedCandidate;
          const messageValue =
            typeof (parsedCandidate as { message?: unknown }).message === 'string'
              ? ((parsedCandidate as { message: string }).message as string)
              : null;
          emitMessageDelta?.(messageValue);
          try {
            onParsedDelta?.(parsedCandidate);
          } catch (err) {
            logger?.('chat.pipeline.error', { stage: `${stageLabel}_parsed_delta`, model, error: formatLogValue(err) });
          }
        } else {
          const partialMessage = extractMessageFromPartialJson(trimmed);
          if (partialMessage && partialMessage.length > lastEmittedMessage.length) {
            emitMessageDelta?.(normalizeEscapes(partialMessage));
          }
        }
      };

      const finalResponse = await client.streamStructuredJson({
        model,
        systemPrompt,
        userContent,
        jsonSchema: jsonSchemaFormat,
        maxOutputTokens:
          typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0 ? Math.floor(maxTokens) : undefined,
        temperature: typeof temperature === 'number' && Number.isFinite(temperature) ? temperature : undefined,
        openAiReasoning: reasoning,
        signal,
        stage: stageLabel,
        logger: logger ?? undefined,
        onTextSnapshot: (snapshot: string) => {
          try {
            handleTextSnapshot(snapshot);
          } catch (err) {
            logger?.('chat.pipeline.error', { stage: `${stageLabel}_delta`, model, error: formatLogValue(err) });
          }
        },
      });

      if (abortListener && signal) {
        signal.removeEventListener('abort', abortListener);
      }

      const usage = finalResponse.usage;
      if (usage) {
        logger?.('chat.pipeline.tokens', {
          stage: stageLabel,
          model,
          attempt,
          usage,
        });
        onUsage?.(stageLabel, model, usage);
      }

      const rawContent = (finalResponse.rawText || streamedText).trim();
      if (typeof rawContent === 'string' && rawContent.length) {
        try {
          onRawResponse?.(rawContent);
        } catch (err) {
          logger?.('chat.pipeline.error', { stage: `${stageLabel}_raw_debug`, model, error: formatLogValue(err) });
        }
      }
      const structuredCandidate = typeof finalResponse.structured !== 'undefined' ? finalResponse.structured : streamedParsed;
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

      try {
        if (typeof candidate !== 'undefined') {
          onParsedDelta?.(candidate);
        }
      } catch (err) {
        logger?.('chat.pipeline.error', { stage: `${stageLabel}_parsed_delta_final`, model, error: formatLogValue(err) });
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

function normalizePlannerOutput(plan: PlannerLLMOutput, model?: string): RetrievalPlan {
  const queries: RetrievalPlan['queries'] = Array.isArray(plan.queries)
    ? plan.queries
      .map((query) => {
        const source = query?.source;
        const text = source === 'profile' ? undefined : sanitizePlannerQueryText(query?.text ?? '');
        return {
          source,
          // Profile retrieval is a fetch-all; ignore any planner-provided text.
          text,
          limit: clampQueryLimit(query?.limit),
        };
      })
      .filter((query) => query.source === 'projects' || query.source === 'resume' || query.source === 'profile')
    : [];

  const deduped: RetrievalPlan['queries'] = [];
  const seen = new Set<string>();
  for (const query of queries) {
    const key = `${query.source}:${(query.text ?? '').toLowerCase()}:${query.limit ?? DEFAULT_QUERY_LIMIT}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(query);
  }
  const thoughts = Array.isArray(plan.thoughts)
    ? plan.thoughts
      .map((thought) => (typeof thought === 'string' ? thought.trim() : ''))
      .filter(Boolean)
    : [];

  return {
    queries: deduped,
    topic: plan.topic?.trim() || undefined,
    useProfileContext: Boolean(plan.useProfileContext),
    thoughts: thoughts.length ? thoughts : undefined,
    model,
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

async function executeRetrievalPlan(
  retrieval: RetrievalDrivers,
  plan: RetrievalPlan,
  options?: { logger?: ChatRuntimeOptions['logger']; cache?: RetrievalCache; embeddingModel?: string; minRelevanceScore?: number; onQueryResult?: (summary: RetrievalSummary) => void }
): Promise<ExecutedRetrievalResult> {
  const cache = options?.cache;

  const fetchProjects = async (query: string, topK: number): Promise<ProjectDoc[]> => {
    const cacheKey = `${query}:${topK}`;
    if (cache?.projects.has(cacheKey)) {
      options?.logger?.('chat.pipeline.retrieval.cache', { source: 'projects', hit: true, key: cacheKey });
      return cache.projects.get(cacheKey) ?? [];
    }
    const results = await retrieval.searchProjectsByText(query, topK);
    cache?.projects.set(cacheKey, results);
    return results;
  };

  const fetchResume = async (query: string, topK: number): Promise<ResumeDoc[]> => {
    const cacheKey = `${query}:${topK}`;
    if (cache?.resume.has(cacheKey)) {
      options?.logger?.('chat.pipeline.retrieval.cache', { source: 'resume', hit: true, key: cacheKey });
      return cache.resume.get(cacheKey) ?? [];
    }
    const results = await retrieval.searchExperiencesByText(query, topK);
    cache?.resume.set(cacheKey, results);
    return results;
  };

  const fetchProfile = async (): Promise<ProfileDoc | undefined> => {
    const cacheKey = 'profile';
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

  const parts = await Promise.all(
    plan.queries.map(async (query) => {
      const topK = clampQueryLimit(query.limit);
      const queryText = query.text ?? '';
      if (query.source === 'projects') {
        const results = await fetchProjects(queryText, topK);
        options?.onQueryResult?.({
          source: 'projects',
          queryText,
          requestedTopK: topK,
          effectiveTopK: topK,
          numResults: results.length,
        });
        return { projects: results, resumeDocs: [], profile: undefined } as const;
      }
      if (query.source === 'resume') {
        const results = await fetchResume(queryText, topK);
        options?.onQueryResult?.({
          source: 'resume',
          queryText,
          requestedTopK: topK,
          effectiveTopK: topK,
          numResults: results.length,
        });
        return { projects: [], resumeDocs: results, profile: undefined } as const;
      }
      // Profile queries don't use text - profile is fetched as-is
      const profileDoc = await fetchProfile();
      options?.onQueryResult?.({
        source: 'profile',
        queryText: undefined,
        requestedTopK: 1,
        effectiveTopK: 1,
        numResults: profileDoc ? 1 : 0,
      });
      return { projects: [], resumeDocs: [], profile: profileDoc } as const;
    })
  );

  const projects = dedupeById(
    parts.flatMap((p) => p.projects),
    (p) => p.id
  );
  const resumeDocs = dedupeById(parts.flatMap((p) => p.resumeDocs), (d) => d.id);
  const resumeSplit = splitResumeDocs(resumeDocs);
  const profile = parts.find((p) => p.profile)?.profile;

  // Filter out low-relevance docs, then cap total count.
  const unfilteredResult: RetrievalResult = {
    projects,
    experiences: Array.from(resumeSplit.experience.values()),
    education: Array.from(resumeSplit.education.values()),
    awards: Array.from(resumeSplit.award.values()),
    skills: Array.from(resumeSplit.skill.values()),
    profile,
  };
  const relevantResult = filterByRelevanceScore(unfilteredResult, options?.minRelevanceScore ?? DEFAULT_MIN_RELEVANCE_SCORE);
  const cappedResult = trimRetrievedDocs(relevantResult, 12);

  const summaries: RetrievalSummary[] = plan.queries.map((query) => ({
    source: query.source,
    queryText: query.text,
    requestedTopK: clampQueryLimit(query.limit),
    effectiveTopK: clampQueryLimit(query.limit),
    numResults:
      query.source === 'projects'
        ? cappedResult.projects.length
        : query.source === 'profile'
          ? cappedResult.profile
            ? 1
            : 0
          : cappedResult.experiences.length +
          cappedResult.education.length +
          cappedResult.awards.length +
          cappedResult.skills.length,
    embeddingModel: options?.embeddingModel,
  }));

  return {
    result: cappedResult,
    summaries,
  };
}

// --- Answer helpers ---

function buildPlannerUserContent(conversationSnippet: string, userMessage: string): string {
  return [
    `Conversation:\n${conversationSnippet}`,
    '',
    `Latest user message: "${userMessage}"`,
    'Return ONLY the RetrievalPlan JSON.',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildAnswerUserContent(input: {
  conversationSnippet: string;
  retrieved: RetrievalResult;
}): string {
  const { conversationSnippet, retrieved } = input;

  return [
    `## Conversation`,
    conversationSnippet,
    '',
    `## Retrieved Projects (${retrieved.projects.length})`,
    JSON.stringify(
      retrieved.projects.map((p) => ({
        id: p.id,
        relevance: p._score ?? 0,
        name: p.name,
        oneLiner: p.oneLiner,
        description: normalizeSnippet(p.description),
        impactSummary: normalizeSnippet(p.impactSummary),
        sizeOrScope: p.sizeOrScope,
        techStack: p.techStack,
        languages: p.languages,
        tags: p.tags,
        context: p.context,
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
        relevance: e._score ?? 0,
        company: e.company,
        title: e.title,
        location: e.location,
        startDate: e.startDate,
        endDate: e.endDate,
        isCurrent: e.isCurrent,
        experienceType: e.experienceType,
        summary: normalizeSnippet(e.summary),
        impactSummary: normalizeSnippet(e.impactSummary),
        sizeOrScope: e.sizeOrScope,
        skills: e.skills,
        linkedProjects: e.linkedProjects,
        bullets: e.bullets?.slice(0, EXPERIENCE_BODY_SNIPPET_COUNT),
      })),
      null,
      2
    ),
    '',
    `## Retrieved Education (${retrieved.education.length})`,
    JSON.stringify(
      retrieved.education.map((e) => ({
        id: e.id,
        relevance: e._score ?? 0,
        institution: e.institution,
        degree: e.degree,
        field: e.field,
        location: e.location,
        startDate: e.startDate,
        endDate: e.endDate,
        isCurrent: e.isCurrent,
        summary: normalizeSnippet(e.summary),
        skills: e.skills,
        bullets: e.bullets?.slice(0, EXPERIENCE_BODY_SNIPPET_COUNT),
      })),
      null,
      2
    ),
  ]
    .filter(Boolean)
    .join('\n');
}

function buildUi(uiHints: AnswerUiHints | undefined, retrieved: RetrievalResult, profileContext?: ProfileContext): UiPayload {
  const socialLinks = profileContext?.socialLinks ?? retrieved.profile?.socialLinks ?? [];
  const normalizedLinks = new Set<SocialPlatform>(
    socialLinks
      .map((link) => normalizeDocId((link as { platform?: string }).platform ?? '') as SocialPlatform)
      .filter((platform): platform is SocialPlatform => Boolean(platform))
  );

  const projectIds = new Set(retrieved.projects.map((p) => normalizeDocId(p.id)));
  const experienceIds = new Set(retrieved.experiences.map((e) => normalizeDocId(e.id)));
  const educationIds = new Set(retrieved.education.map((e) => normalizeDocId(e.id)));

  const showLinks = (uiHints?.links ?? [])
    .map(normalizeDocId)
    .filter((id): id is SocialPlatform => Boolean(id) && normalizedLinks.has(id as SocialPlatform))
    .slice(0, MAX_DISPLAY_ITEMS);

  const showProjects = (uiHints?.projects ?? [])
    .map(normalizeDocId)
    .filter((id) => id && projectIds.has(id))
    .slice(0, MAX_DISPLAY_ITEMS);

  const showExperiences = (uiHints?.experiences ?? [])
    .map(normalizeDocId)
    .filter((id) => id && experienceIds.has(id))
    .slice(0, MAX_DISPLAY_ITEMS);

  const showEducation = (uiHints?.education ?? [])
    .map(normalizeDocId)
    .filter((id) => id && educationIds.has(id))
    .slice(0, MAX_DISPLAY_ITEMS);

  return { showProjects, showExperiences, showEducation, showLinks };
}

function uiPayloadEquals(a: UiPayload | null | undefined, b: UiPayload | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const eq = (x: string[], y: string[]) => x.length === y.length && x.every((val, idx) => val === y[idx]);
  return (
    eq(a.showProjects, b.showProjects) &&
    eq(a.showExperiences, b.showExperiences) &&
    eq(a.showEducation, b.showEducation) &&
    eq(a.showLinks as unknown as string[], b.showLinks as unknown as string[])
  );
}

function coerceUiHints(candidate: unknown): AnswerUiHints | undefined {
  if (!candidate || typeof candidate !== 'object') return undefined;
  if (!Object.prototype.hasOwnProperty.call(candidate, 'uiHints')) return undefined;
  const parsed = UiHintsSchema.safeParse((candidate as { uiHints?: unknown }).uiHints);
  if (!parsed.success) return undefined;
  return parsed.data;
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
  ui.showEducation.forEach(addResume);
  return attachments;
}

// --- Retrieval docs helpers ---

function buildRetrievalDocs(retrieved: RetrievalResult): RetrievalDocs {
  const projects: RetrievedProjectDoc[] = retrieved.projects.map((p) => ({
    id: p.id,
    name: p.name,
    oneLiner: p.oneLiner,
    techStack: p.techStack?.slice(0, 5),
    _score: p._score,
  }));

  const resume: RetrievedResumeDoc[] = [
    ...retrieved.experiences.map((e) => ({
      id: e.id,
      type: 'experience' as const,
      title: e.title,
      company: e.company,
      summary: e.summary,
      _score: e._score,
    })),
    ...retrieved.education.map((e) => ({
      id: e.id,
      type: 'education' as const,
      institution: e.institution,
      title: e.degree,
      summary: e.summary,
      _score: e._score,
    })),
    ...retrieved.awards.map((a) => ({
      id: a.id,
      type: 'award' as const,
      title: a.title,
      summary: a.summary,
      _score: a._score,
    })),
    ...retrieved.skills.map((s) => ({
      id: s.id,
      type: 'skill' as const,
      title: s.name,
      summary: s.summary,
      _score: s._score,
    })),
  ];

  return { projects, resume };
}

// --- Reasoning trace helpers ---

function buildErrorTrace(stage: ReasoningStage, error: Error): ReasoningUpdate {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const traceError: ReasoningTraceError = {
    stage,
    message,
    code: 'internal_error',
    retryable: true,
  };
  return {
    stage,
    trace: buildPartialReasoningTrace({ error: traceError }),
  };
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
  const plannerModel = modelConfig.plannerModel;
  const embeddingModel = modelConfig.embeddingModel;
  const stageReasoning = options?.modelConfig?.reasoning;
  const tokenLimits = options?.tokenLimits ?? {};
  const minRelevanceScore = Math.max(0, Math.min(1, options?.retrieval?.minRelevanceScore ?? DEFAULT_MIN_RELEVANCE_SCORE));
  const logger = options?.logger;
  const runtimePersona = options?.persona;
  const runtimeProfileContext = buildProfileContext(options?.profile, runtimePersona);
  const baseLogPrompts = options?.logPrompts ?? false;
  const plannerCache = new Map<string, RetrievalPlan>();
  const retrievalCache: RetrievalCache = {
    projects: new Map(),
    resume: new Map(),
    profile: new Map(),
  };
  const buildPlannerCacheKey = (snippet: string) => JSON.stringify({ snippet });

  const createReasoningEmitter = (runOptions?: RunChatPipelineOptions) => {
    const allowReasoning = Boolean(runOptions?.reasoningEnabled && runOptions?.onReasoningUpdate);
    let streamedReasoning: PartialReasoningTrace = buildPartialReasoningTrace();
    const emit = (update: ReasoningUpdate) => {
      if (!allowReasoning || !runOptions?.onReasoningUpdate) return;
      const baseTrace = update.trace ?? buildPartialReasoningTrace();
      const streamingTrace =
        update.delta || update.notes || typeof update.progress === 'number'
          ? buildPartialReasoningTrace({
            streaming: {
              [update.stage]: {
                text: update.delta,
                notes: update.notes,
                progress: update.progress,
              },
            },
          })
          : null;
      const incomingTrace = streamingTrace ? mergeReasoningTraces(baseTrace, streamingTrace) : baseTrace;
      streamedReasoning = mergeReasoningTraces(streamedReasoning, incomingTrace);
      runOptions.onReasoningUpdate({ ...update, trace: streamedReasoning });
    };
    return { emit };
  };

  return {
    async run(client: LlmClient, messages: ChatRequestMessage[], runOptions?: RunChatPipelineOptions): Promise<ChatbotResponse> {
      const tStart = performance.now();
      const devDebugEnabled = process.env.NODE_ENV !== 'production';
      const timings: Record<string, number> = {};
      const { signal: runSignal, cleanup: cleanupAborters, timedOut } = createAbortSignal(runOptions);
      const stageUsages: StageUsage[] = [];
      const missingCostWarned = new Set<string>();
      const recordUsage = (stage: string, model: string, usageRaw: unknown) => {
        if (!model) return;
        const parsed = parseUsage(usageRaw, { allowZero: true });
        if (!parsed) return;
        const costUsd = estimateCostUsd(model, parsed);
        if (costUsd === null) {
          const key = model || 'unknown';
          if (!missingCostWarned.has(key)) {
            missingCostWarned.add(key);
            logger?.('chat.pipeline.cost_pricing_missing', { stage, model });
          }
        }
        stageUsages.push({
          stage,
          model,
          usage: parsed,
          costUsd: typeof costUsd === 'number' && Number.isFinite(costUsd) ? costUsd : undefined,
        });
      };
      const logPrompts = runOptions?.logPrompts ?? baseLogPrompts;
      const logPipelineSummary = (result: ChatbotResponse) => {
        if (!logger) return;

        const usageEntries = Array.isArray(result.usage) && result.usage.length ? result.usage : stageUsages;
        const totals = usageEntries.reduce(
          (acc, entry) => {
            const promptTokens = entry.usage?.promptTokens ?? 0;
            const completionTokens = entry.usage?.completionTokens ?? 0;
            acc.promptTokens += promptTokens;
            acc.completionTokens += completionTokens;
            acc.totalTokens += entry.usage?.totalTokens ?? promptTokens + completionTokens;
            acc.costUsd += entry.costUsd ?? 0;
            return acc;
          },
          { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 }
        );

        logger('chat.pipeline.summary', {
          plan: (result as { reasoningTrace?: ReasoningTrace })?.reasoningTrace?.plan ?? null,
          retrieval: (result as { reasoningTrace?: ReasoningTrace })?.reasoningTrace?.retrieval ?? null,
          answer: (result as { reasoningTrace?: ReasoningTrace })?.reasoningTrace?.answer ?? null,
          totalPromptTokens: totals.promptTokens,
          totalCompletionTokens: totals.completionTokens,
          totalTokens: totals.totalTokens,
          totalCostUsd: totals.costUsd,
          stages: usageEntries.map((entry) => {
            const promptTokens = entry.usage?.promptTokens ?? 0;
            const completionTokens = entry.usage?.completionTokens ?? 0;
            const totalTokens = entry.usage?.totalTokens ?? promptTokens + completionTokens;
            return {
              stage: entry.stage,
              model: entry.model,
              promptTokens,
              completionTokens,
              totalTokens,
              costUsd: entry.costUsd,
            };
          }),
        });
      };
      const finalize = <T extends ChatbotResponse>(result: T): T => {
        logPipelineSummary(result);
        return result;
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
          return finalize({
            message: '',
            ui: { showProjects: [], showExperiences: [], showEducation: [], showLinks: [] },
            usage: stageUsages,
            error: buildStreamError('internal_error', error.message, false),
          });
        }
        throw error;
      }

      const boundedMessages = windowedMessages.messages.length ? windowedMessages.messages : messages.slice(-DEFAULT_MAX_CONTEXT);
      const userText = extractUserText(boundedMessages);
      const conversationSnippet = buildContextSnippet(boundedMessages);
      const truncationApplied = windowedMessages.truncated;
      const plannerPromptDebug = devDebugEnabled ? { system: '', user: '' } : undefined;
      const answerPromptDebug = devDebugEnabled ? { system: '', user: '' } : undefined;
      let plannerRawResponse: string | undefined;
      let answerRawResponse: string | undefined;

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

      const plannerKey = buildPlannerCacheKey(conversationSnippet);
      emitStageEvent('planner', 'start');

      // Track streamed planner fields for progressive reasoning panel updates
      let lastStreamedPlannerThoughts: string[] | undefined;
      let lastStreamedPlannerQueries: PlannerLLMOutput['queries'] | undefined;
      let lastStreamedPlannerTopic: string | undefined;

      const emitPlannerStreamingDelta = (candidate: unknown) => {
        if (!candidate || typeof candidate !== 'object') return;

        const typed = candidate as Partial<PlannerLLMOutput>;

        const thoughts = Array.isArray(typed.thoughts) ? typed.thoughts : undefined;
        const queries = Array.isArray(typed.queries) ? typed.queries : undefined;
        const topic = typeof typed.topic === 'string' ? typed.topic : undefined;

        const thoughtsChanged = thoughts && JSON.stringify(thoughts) !== JSON.stringify(lastStreamedPlannerThoughts);
        const queriesChanged = queries && JSON.stringify(queries) !== JSON.stringify(lastStreamedPlannerQueries);
        const topicChanged = topic !== undefined && topic !== lastStreamedPlannerTopic;

        if (thoughtsChanged || queriesChanged || topicChanged) {
          if (thoughtsChanged) lastStreamedPlannerThoughts = thoughts;
          if (queriesChanged) lastStreamedPlannerQueries = queries;
          if (topicChanged) lastStreamedPlannerTopic = topic;

          emitReasoning({
            stage: 'planner',
            trace: buildPartialReasoningTrace({
              plan: {
                thoughts: lastStreamedPlannerThoughts,
                queries: lastStreamedPlannerQueries ?? [],
                topic: lastStreamedPlannerTopic,
                useProfileContext: typed.useProfileContext,
              },
            }),
          });
        }
      };

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
          const userContent = buildPlannerUserContent(conversationSnippet, userText);
          const systemPrompt = buildPlannerSystemPrompt(runtimeProfileContext);
          if (plannerPromptDebug) {
            plannerPromptDebug.system = systemPrompt;
            plannerPromptDebug.user = userContent;
          }
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
            onRawResponse: (raw) => {
              if (devDebugEnabled) {
                plannerRawResponse = raw;
              }
            },
            onParsedDelta: emitPlannerStreamingDelta,
          });
          rawPlan = normalizePlannerOutput(plannerOutput, plannerModel);
          if (!cachedPlan) {
            plannerCache.set(plannerKey, rawPlan);
          }
        }
        plan = normalizePlannerOutput(rawPlan, plannerModel);
        timings.planMs = performance.now() - tPlan;
        const plannerUsage = stageUsages.find((entry) => entry.stage === 'planner');
        plan = {
          ...plan,
          effort: coerceReasoningEffort(plannerReasoning?.effort ?? stageReasoning?.planner),
          durationMs: timings.planMs,
          usage: plannerUsage?.usage,
          costUsd: plannerUsage?.costUsd,
        };
        emitStageEvent('planner', 'complete', { topic: plan.topic ?? null }, timings.planMs);
      } catch (error) {
        cleanupAborters();
        logger?.('chat.pipeline.error', { stage: 'plan', error: formatLogValue(error) });
        const timeout = timedOut();
        const message = timeout ? 'I ran out of time planning—please try again.' : 'I hit a planning issue—please try again.';
        emitReasoning(buildErrorTrace('planner', error as Error));
        return finalize({
          message: '',
          ui: { showProjects: [], showExperiences: [], showEducation: [], showLinks: [] },
          usage: stageUsages,
          error: buildStreamError(timeout ? 'llm_timeout' : 'llm_error', message, true),
        });
      }

      emitReasoning({
        stage: 'planner',
        trace: buildPartialReasoningTrace({
          plan,
          debug:
            devDebugEnabled && (plannerPromptDebug || plannerRawResponse)
              ? {
                plannerPrompt: plannerPromptDebug,
                plannerRawResponse,
              }
              : undefined,
        }),
      });

      const hasQueries = plan.queries.length > 0;
      let retrieved: RetrievalResult = {
        projects: [],
        experiences: [],
        education: [],
        awards: [],
        skills: [],
      };
      let retrievalSummaries: RetrievalSummary[] = [];

      if (hasQueries) {
        emitStageEvent('retrieval', 'start');
        try {
          const tRetrieval = performance.now();
          const executed = await executeRetrievalPlan(retrieval, plan, {
            logger,
            cache: retrievalCache,
            embeddingModel,
            minRelevanceScore,
            onQueryResult: (summary) => emitReasoning({ stage: 'retrieval', notes: `${summary.source}: ${summary.numResults} results` }),
          });
          retrieved = executed.result;
          retrievalSummaries = executed.summaries;
          timings.retrievalMs = performance.now() - tRetrieval;
          emitStageEvent(
            'retrieval',
            'complete',
            {
              docsFound:
                retrieved.projects.length +
                retrieved.experiences.length +
                retrieved.education.length +
                retrieved.awards.length +
                retrieved.skills.length,
              sources: retrievalSummaries.map((r) => r.source),
            },
            timings.retrievalMs
          );
        } catch (error) {
          cleanupAborters();
          logger?.('chat.pipeline.error', { stage: 'retrieval', error: formatLogValue(error) });
          emitReasoning(buildErrorTrace('retrieval', error as Error));
          return finalize({
            message: '',
            ui: { showProjects: [], showExperiences: [], showEducation: [], showLinks: [] },
            usage: stageUsages,
            error: buildStreamError('retrieval_error', 'I hit an internal retrieval issue—please try again.', true),
          });
        }

        emitReasoning({
          stage: 'retrieval',
          trace: buildPartialReasoningTrace({
            retrieval: retrievalSummaries,
            retrievalDocs: buildRetrievalDocs(retrieved),
            debug:
              devDebugEnabled && retrieved
                ? {
                  retrievalDocs: {
                    projects: retrieved.projects,
                    resume: [...retrieved.experiences, ...retrieved.education, ...retrieved.awards, ...retrieved.skills],
                  },
                }
                : undefined,
          }),
        });
      }

      const allowProfileContext = Boolean(runtimeProfileContext && (plan.useProfileContext || !hasQueries));
      const profileContextForAnswer = allowProfileContext ? runtimeProfileContext : undefined;
      let latestUiPayload: UiPayload | null = null;
      let uiEmittedDuringStreaming = false;
      const emitUiFromHints = (hints?: AnswerUiHints): UiPayload | undefined => {
        if (!hints) return undefined;
        const nextUi = buildUi(hints, retrieved, profileContextForAnswer);
        if (uiPayloadEquals(latestUiPayload, nextUi)) {
          return nextUi;
        }
        latestUiPayload = nextUi;
        if (runOptions?.onUiEvent) {
          try {
            uiEmittedDuringStreaming = true;
            runOptions.onUiEvent(nextUi);
          } catch (error) {
            logger?.('chat.pipeline.error', { stage: 'ui_emit', error: formatLogValue(error) });
          }
        }
        return nextUi;
      };
      let lastStreamedThoughts: string[] | undefined;
      let lastStreamedCardReasoning: CardSelectionReasoning | null | undefined;

      const emitAnswerStreamingDelta = (candidate: unknown) => {
        if (!candidate || typeof candidate !== 'object') return;

        const typed = candidate as Partial<AnswerPayload>;

        // Stream thoughts to reasoning panel
        const thoughts = Array.isArray(typed.thoughts) ? typed.thoughts : undefined;
        const thoughtsChanged = thoughts && JSON.stringify(thoughts) !== JSON.stringify(lastStreamedThoughts);

        // Stream cardReasoning to reasoning panel
        const cardReasoning = typed.cardReasoning !== undefined ? typed.cardReasoning : undefined;
        const cardReasoningChanged = cardReasoning !== undefined && JSON.stringify(cardReasoning) !== JSON.stringify(lastStreamedCardReasoning);

        if (thoughtsChanged || cardReasoningChanged) {
          if (thoughtsChanged) lastStreamedThoughts = thoughts;
          if (cardReasoningChanged) lastStreamedCardReasoning = cardReasoning;

          emitReasoning({
            stage: 'answer',
            trace: buildPartialReasoningTrace({
              answer: {
                thoughts: lastStreamedThoughts,
                cardReasoning: lastStreamedCardReasoning,
              },
            }),
          });
        }

        // Stream uiHints (only when retrieval was used, otherwise they'll be cleared)
        if (hasQueries) {
          const hints = coerceUiHints(candidate);
          if (hints) {
            emitUiFromHints(hints);
          }
        }
      };

      emitStageEvent('answer', 'start');

      const answerModel = hasQueries
        ? modelConfig.answerModel
        : modelConfig.answerModelNoRetrieval ?? modelConfig.answerModel;

      const userContent = buildAnswerUserContent({
        conversationSnippet,
        retrieved,
      });
      const systemPrompt = buildAnswerSystemPrompt(runtimePersona, profileContextForAnswer);
      if (answerPromptDebug) {
        answerPromptDebug.system = systemPrompt;
        answerPromptDebug.user = userContent;
      }
      if (logPrompts) {
        logger?.('chat.pipeline.prompt', {
          stage: 'answer',
          model: answerModel,
          systemPrompt,
          userContent,
        });
      }

      const answerReasoningEffort = hasQueries ? stageReasoning?.answer : stageReasoning?.answerNoRetrieval ?? 'minimal';
      const answerReasoning = resolveReasoningParams(answerModel, Boolean(runOptions?.reasoningEnabled), answerReasoningEffort);
      let answer: AnswerPayload;
      try {
        const tAnswer = performance.now();
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
          },
          onUsage: recordUsage,
          reasoning: answerReasoning,
          temperature: modelConfig.answerTemperature,
          onRawResponse: (raw) => {
            if (devDebugEnabled) {
              answerRawResponse = raw;
            }
          },
          onParsedDelta: emitAnswerStreamingDelta,
        });
        timings.answerMs = performance.now() - tAnswer;
      } catch (error) {
        cleanupAborters();
        logger?.('chat.pipeline.error', { stage: 'answer', error: formatLogValue(error) });
        emitReasoning(buildErrorTrace('answer', error as Error));
        const timeout = timedOut();
        return finalize({
          message: '',
          ui: { showProjects: [], showExperiences: [], showEducation: [], showLinks: [] },
          usage: stageUsages,
          error: buildStreamError(timeout ? 'llm_timeout' : 'llm_error', 'I had trouble generating a reply—please try again.', true),
        });
      }

      if (!hasQueries) {
        answer.uiHints = undefined;
        answer.cardReasoning = undefined;
      }

      const ui = emitUiFromHints(answer.uiHints) ?? buildUi(answer.uiHints, retrieved, profileContextForAnswer);
      const shouldEmitFinalUi =
        !latestUiPayload || !uiPayloadEquals(latestUiPayload, ui) || !uiEmittedDuringStreaming;
      if (shouldEmitFinalUi) {
        latestUiPayload = ui;
        try {
          runOptions?.onUiEvent?.(ui);
        } catch (error) {
          logger?.('chat.pipeline.error', { stage: 'ui_emit', error: formatLogValue(error) });
        }
      } else if (!latestUiPayload) {
        latestUiPayload = ui;
      }

      const projectMap = new Map(retrieved.projects.map((p) => [normalizeDocId(p.id), p]));
      const resumeMaps: ResumeMaps = splitResumeDocs([...retrieved.experiences, ...retrieved.education, ...retrieved.awards, ...retrieved.skills]);
      const attachments = buildAttachmentPayloads(ui, projectMap, resumeMaps);

      const answerUsage = stageUsages.find((entry) => entry.stage === 'answer');
      const answerTrace: PartialReasoningTrace['answer'] = {
        model: answerModel,
        uiHints: answer.uiHints,
        thoughts: answer.thoughts,
        cardReasoning: answer.cardReasoning,
        effort: coerceReasoningEffort(answerReasoning?.effort ?? answerReasoningEffort),
        durationMs: timings.answerMs,
        usage: answerUsage?.usage,
        costUsd: answerUsage?.costUsd,
      };

      const reasoningTrace: ReasoningTrace = {
        plan,
        retrieval: retrievalSummaries,
        answer: answerTrace,
      };

      emitReasoning({
        stage: 'answer',
        trace: buildPartialReasoningTrace({
          answer: reasoningTrace.answer,
          debug:
            devDebugEnabled && (answerPromptDebug || answerRawResponse)
              ? {
                answerPrompt: answerPromptDebug,
                answerRawResponse,
              }
              : undefined,
        }),
      });

      timings.totalMs = performance.now() - tStart;

      const totalCostUsd = stageUsages.reduce((sum, entry) => sum + (entry.costUsd ?? 0), 0);

      return finalize({
        message: answer.message,
        ui,
        answerThoughts: answer.thoughts,
        attachments: attachments.length ? attachments : undefined,
        reasoningTrace,
        truncationApplied,
        usage: stageUsages,
        totalCostUsd,
      });
    },
  };
}
