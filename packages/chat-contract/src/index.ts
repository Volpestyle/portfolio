import { z } from 'zod';
import type { TokenUsage } from './cost';
export * from './cost';

export const SOCIAL_PLATFORM_VALUES = ['x', 'github', 'youtube', 'linkedin', 'spotify'] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORM_VALUES)[number];

export type ProfileSocialLink = {
  platform: SocialPlatform;
  label: string;
  url: string;
  blurb?: string;
};

type RepoOwner = {
  login: string;
};

type RepoLanguagePercentage = {
  name: string;
  percent: number;
};

export type RepoData = {
  id?: number;
  name: string;
  full_name?: string;
  description: string | null;
  created_at: string;
  pushed_at?: string | null;
  updated_at?: string | null;
  html_url?: string;
  isStarred: boolean;
  default_branch?: string;
  private?: boolean;
  icon?: string;
  owner?: RepoOwner;
  homepage?: string | null;
  language?: string | null;
  topics?: string[];
  summary?: string;
  tags?: string[];
  languagesBreakdown?: Record<string, number>;
  languagePercentages?: RepoLanguagePercentage[];
};

type ProjectContextType = 'personal' | 'work' | 'oss' | 'academic' | 'other';

type ProjectTimeframe = {
  start?: string;
  end?: string;
};

export type ProjectContext = {
  type: ProjectContextType;
  organization?: string;
  role?: string;
  timeframe?: ProjectTimeframe;
};

type ScoreSignals = {
  structured?: number;
  text?: number;
  semantic?: number;
  recency?: number;
};

export type ScoreMetadata = {
  _score?: number;
  _signals?: ScoreSignals;
};

export type Scored<T> = T & ScoreMetadata;

export const DEFAULT_CHAT_HISTORY_LIMIT = 6;

export type ProjectSummary = {
  id: string;
  slug: string;
  name: string;
  oneLiner: string;
  description: string;
  impactSummary?: string;
  sizeOrScope?: string;
  techStack: string[];
  languages: string[];
  tags: string[];
  context: ProjectContext;
  githubUrl?: string;
  liveUrl?: string;
} & ScoreMetadata;

export type ProjectSearchResult = ProjectSummary & {
  bullets: string[];
};

export type ProjectDetail = ProjectSummary & {
  bullets: string[];
  readme: string;
};

export type ProjectSearchInput = {
  text?: string;
  languages?: string[];
  techStack?: string[];
  organization?: string;
  type?: string;
  limit?: number;
};

export type ExperienceRecord = {
  type?: 'experience';
  id: string;
  slug: string;
  company: string;
  title: string;
  location?: string;
  startDate: string;
  endDate?: string | null;
  isCurrent: boolean;
  experienceType?: 'full_time' | 'internship' | 'contract' | 'freelance' | 'other';
  summary?: string;
  bullets: string[];
  skills: string[];
  linkedProjects: string[];
  monthsOfExperience?: number | null;
  impactSummary?: string;
  sizeOrScope?: string;
} & ScoreMetadata;

export type EducationRecord = {
  type: 'education';
  id: string;
  institution: string;
  degree?: string;
  field?: string;
  location?: string;
  startDate?: string;
  endDate?: string | null;
  isCurrent?: boolean;
  summary?: string;
  bullets?: string[];
  skills?: string[];
} & ScoreMetadata;

export type AwardRecord = {
  type: 'award';
  id: string;
  title: string;
  issuer?: string;
  date?: string;
  summary?: string;
  bullets?: string[];
  skills?: string[];
} & ScoreMetadata;

export type SkillRecord = {
  type: 'skill';
  id: string;
  name: string;
  category?: string;
  summary?: string;
  skills?: string[];
} & ScoreMetadata;

export type ResumeEntry = ExperienceRecord | EducationRecord | AwardRecord | SkillRecord;

export type ProfileSummary = {
  updatedAt?: string;
  fullName: string;
  headline: string;
  domainLabel?: string;
  currentLocation?: string;
  currentRole?: string;
  about: string[] | string;
  topSkills: string[];
  systemPersona?: string;
  shortAbout?: string;
  styleGuidelines?: string[];
  voiceExamples?: string[];
  featuredExperiences?: ExperienceRecord[];
  socialLinks?: ProfileSocialLink[];
};

export type PersonaProfile = {
  updatedAt?: string;
  fullName?: string;
  headline?: string;
  currentLocation?: string;
  currentRole?: string;
  topSkills?: string[];
  socialLinks?: Array<{
    url: string;
    blurb?: string;
  }>;
  featuredExperienceIds?: string[];
};

export type PersonaSummary = {
  systemPersona: string;
  shortAbout: string;
  styleGuidelines: string[];
  voiceExamples?: string[];
  profile?: PersonaProfile;
  generatedAt?: string;
};

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high';

export type StageReasoningConfig = {
  planner?: ReasoningEffort;
  answer?: ReasoningEffort;
  answerNoRetrieval?: ReasoningEffort;
};

export type ModelConfig = {
  plannerModel: string;
  answerModel: string;
  answerModelNoRetrieval?: string;
  embeddingModel: string;
  answerTemperature?: number;
  reasoning?: StageReasoningConfig;
};

export type DataProviders = {
  projects: ProjectDetail[];
  resume: ResumeEntry[];
  profile: ProfileSummary | null;
  persona: PersonaSummary;
  embeddingIndexes: {
    projects: EmbeddingIndex;
    resume: EmbeddingIndex;
    profile?: EmbeddingIndex | null;
  };
};

export type ChatRole = 'user' | 'assistant';

export type BannerState =
  | { mode: 'idle' }
  | { mode: 'thinking' }
  | { mode: 'hover'; text?: string }
  | { mode: 'chat'; text?: string };

export type ChatTextPart = {
  kind: 'text';
  text: string;
  itemId?: string;
};

export type ChatMessagePart = ChatTextPart;

export type ChatMessage = {
  id: string;
  role: ChatRole;
  parts: ChatMessagePart[];
  createdAt?: string;
  animated?: boolean;
};

export type ChatRequestMessage = {
  role: ChatRole;
  content: string;
};

// Chat pipeline contract (planner/retrieval/answer)
export type RetrievalSource = 'projects' | 'resume' | 'profile';
export type ExperienceScope = 'employment_only' | 'any_experience';

export type PlannerQuery = {
  source: RetrievalSource;
  text?: string | null; // Optional for profile queries (profile is fetched as-is, not searched)
  limit?: number | null;
};

export type PlannerLLMOutput = {
  thoughts?: string[];
  queries: PlannerQuery[];
  topic?: string;
  useProfileContext?: boolean;
};

export type RetrievalPlan = PlannerLLMOutput & {
  model?: string;
  effort?: ReasoningEffort;
  durationMs?: number;
  usage?: TokenUsage;
  costUsd?: number;
};

export type AnswerUiHints = {
  projects?: string[];
  experiences?: string[];
  education?: string[];
  links?: SocialPlatform[];
};

export type CardSelectionReason = {
  id: string;
  name: string;
  reason: string;
};

export type CardSelectionCategory = {
  included: CardSelectionReason[];
  excluded: CardSelectionReason[];
};

export type CardSelectionReasoning = {
  projects?: CardSelectionCategory | null;
  experiences?: CardSelectionCategory | null;
  education?: CardSelectionCategory | null;
  links?: CardSelectionCategory | null;
};

export type AnswerPayload = {
  thoughts?: string[];
  cardReasoning?: CardSelectionReasoning | null;
  uiHints?: AnswerUiHints;
  message: string;
};

export type UiPayload = {
  showProjects: string[];
  showExperiences: string[];
  showEducation: string[];
  showLinks: SocialPlatform[];
};

export const RETRIEVAL_SOURCE_VALUES = ['projects', 'resume', 'profile'] as const;
export const RETRIEVAL_REQUEST_TOPK_MAX = 10;
export const RETRIEVAL_REQUEST_TOPK_DEFAULT = 8;

const PlannerQuerySchema: z.ZodType<PlannerQuery, z.ZodTypeDef, unknown> = z.object({
  source: z.enum(RETRIEVAL_SOURCE_VALUES),
  text: z.string().nullable().optional(), // Optional for profile queries
  limit: z.number().int().min(1).max(RETRIEVAL_REQUEST_TOPK_MAX).nullable().optional(),
});

/**
 * Schema for parsing raw Planner LLM output (per simplified spec).
 */
export const PlannerLLMOutputSchema: z.ZodType<PlannerLLMOutput, z.ZodTypeDef, unknown> = z.object({
  thoughts: z.array(z.string()).default([]),
  queries: z.array(PlannerQuerySchema).default([]),
  topic: z.string().default(''),
  useProfileContext: z.boolean().default(false),
});

const AnswerUiHintsSchema = z.object({
  projects: z.array(z.string()).default([]),
  experiences: z.array(z.string()).default([]),
  education: z.array(z.string()).default([]),
  links: z.array(z.enum(SOCIAL_PLATFORM_VALUES)).default([]),
});

const CardSelectionReasonSchema = z.object({
  id: z.string(),
  name: z.string(),
  reason: z.string(),
});

const CardSelectionCategorySchema = z.object({
  included: z.array(CardSelectionReasonSchema),
  excluded: z.array(CardSelectionReasonSchema),
});

const CardSelectionReasoningSchema = z.object({
  projects: CardSelectionCategorySchema.nullable().optional(),
  experiences: CardSelectionCategorySchema.nullable().optional(),
  education: CardSelectionCategorySchema.nullable().optional(),
  links: CardSelectionCategorySchema.nullable().optional(),
});

export const AnswerPayloadSchema = z.object({
  thoughts: z.array(z.string()).default([]),
  cardReasoning: CardSelectionReasoningSchema.nullable().optional(),
  uiHints: AnswerUiHintsSchema.default({}),
  message: z.string(),
});

export type RetrievalSummary = {
  source: RetrievalSource;
  queryText?: string | null; // Optional for profile queries
  requestedTopK: number;
  effectiveTopK: number;
  numResults: number;
  embeddingModel?: string;
};

export type ReasoningStage = 'planner' | 'retrieval' | 'answer';

export type ReasoningPrompt = {
  system: string;
  user: string;
};

export type ReasoningDebug = {
  plannerPrompt?: ReasoningPrompt;
  answerPrompt?: ReasoningPrompt;
  plannerRawResponse?: string;
  answerRawResponse?: string;
  retrievalDocs?: {
    projects?: unknown[];
    resume?: unknown[];
    profile?: unknown | null;
  };
};

export type ReasoningTraceError = {
  stage?: ReasoningStage | 'unknown';
  message: string;
  code?: string;
  retryable?: boolean;
  retryAfterMs?: number;
};

export type ReasoningUpdate = {
  stage: ReasoningStage;
  trace?: PartialReasoningTrace;
  notes?: string;
  delta?: string;
  progress?: number;
};

export type AnswerReasoning = {
  model?: string;
  uiHints?: AnswerUiHints;
  thoughts?: string[];
  cardReasoning?: CardSelectionReasoning | null;
  effort?: ReasoningEffort;
  durationMs?: number;
  usage?: TokenUsage;
  costUsd?: number;
};

export type RetrievedProjectDoc = {
  id: string;
  name: string;
  oneLiner?: string;
  techStack?: string[];
  _score?: number;
};

export type RetrievedResumeDoc = {
  id: string;
  type?: 'experience' | 'education' | 'award' | 'skill';
  title?: string;
  company?: string;
  institution?: string;
  summary?: string;
  _score?: number;
};

export type RetrievalDocs = {
  projects?: RetrievedProjectDoc[];
  resume?: RetrievedResumeDoc[];
};

export type PartialReasoningTrace = {
  plan: RetrievalPlan | null;
  retrieval: RetrievalSummary[] | null;
  retrievalDocs?: RetrievalDocs | null;
  answer: AnswerReasoning | null;
  error?: ReasoningTraceError | null;
  debug?: ReasoningDebug | null;
  streaming?: Partial<
    Record<
      ReasoningStage,
      {
        text?: string;
        notes?: string;
        progress?: number;
      }
    >
  >;
};

type CompleteReasoningTrace<T extends PartialReasoningTrace> = {
  [K in keyof T]: NonNullable<T[K]>;
};

export type ReasoningTrace = CompleteReasoningTrace<PartialReasoningTrace>;

type StreamErrorCode =
  | 'llm_timeout'
  | 'llm_error'
  | 'retrieval_error'
  | 'internal_error'
  | 'stream_interrupted'
  | 'rate_limited'
  | 'budget_exceeded';

export type ChatStreamError = {
  code: StreamErrorCode;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
};

export type EmbeddingIndexMeta = {
  schemaVersion: number;
  buildId: string;
};

export type EmbeddingEntry = {
  id: string;
  vector: number[];
};

export type EmbeddingIndex = {
  meta: EmbeddingIndexMeta;
  entries: EmbeddingEntry[];
};

/**
 * Split a long string into smaller chunks for streaming or SSE payloads.
 */
export function chunkText(text: string, size = 120): string[] {
  const normalized = text || '';
  if (!normalized.trim().length) {
    return [];
  }
  if (normalized.length <= size) {
    return [normalized];
  }
  const parts: string[] = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    parts.push(normalized.slice(cursor, cursor + size));
    cursor += size;
  }
  return parts;
}
