import { z } from 'zod';
export * from './cost';

export type SocialPlatform = 'x' | 'github' | 'youtube' | 'linkedin' | 'spotify';

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
  location?: string;
  currentRole?: string;
  about: string[] | string;
  topSkills: string[];
  featuredExperiences?: ExperienceRecord[];
  socialLinks?: ProfileSocialLink[];
};

export type PersonaSummary = {
  systemPersona: string;
  shortAbout: string;
  styleGuidelines: string[];
  generatedAt?: string;
  sourceHashes?: Record<string, string>;
};

export type OwnerConfig = {
  ownerId: string;
  ownerName: string;
  ownerPronouns?: string;
  domainLabel: string;
  portfolioKind?: 'individual' | 'team' | 'organization';
};

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high';

export type StageReasoningConfig = {
  planner?: ReasoningEffort;
  evidence?: ReasoningEffort;
  answer?: ReasoningEffort;
};

export type ModelConfig = {
  plannerModel: string;
  evidenceModel: string;
  evidenceModelDeepDive?: string;
  answerModel: string;
  embeddingModel: string;
  /** @deprecated Use stageReasoning for per-stage control */
  reasoningEffort?: ReasoningEffort;
  stageReasoning?: StageReasoningConfig;
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

export type BannerMode = 'idle' | 'thinking' | 'hover' | 'chat';

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

// Chat pipeline contract (planner/evidence/answer)
export type RetrievalSource = 'projects' | 'resume' | 'profile';

export type ExperienceScope = 'employment_only' | 'any_experience';

export type ResumeFacet = 'experience' | 'education' | 'award' | 'skill';

export type RetrievalRequest = {
  source: RetrievalSource;
  queryText: string;
  topK: number;
};

export type AnswerMode = 'binary_with_evidence' | 'overview_list' | 'narrative_with_examples' | 'meta_chitchat';

export type AnswerLengthHint = 'short' | 'medium' | 'detailed';

export type Intent = 'fact_check' | 'enumerate' | 'describe' | 'compare' | 'meta';

/**
 * What the user wants to SEE in the UI.
 * - 'text': text answer only, suppress all cards (e.g., "what languages have you used?", "how many frameworks do you know?")
 *
 * When omitted/undefined, cards are shown based on evidence stage's uiHints (default behavior).
 * The evidence stage decides WHICH cards (projects vs experiences) to show.
 */
export type UiTarget = 'text';

/**
 * What the Planner LLM outputs directly (per spec §4.2).
 * Does NOT include derived fields like answerMode or enumerateAllRelevant.
 */
export type PlannerLLMOutput = {
  intent: Intent;
  topic: string | null;
  plannerConfidence: number;
  isFollowup: boolean;
  experienceScope?: ExperienceScope | null;
  retrievalRequests: RetrievalRequest[];
  resumeFacets?: ResumeFacet[];
  answerLengthHint: AnswerLengthHint;
  /**
   * What the user wants to SEE in the UI.
   * - 'text': text answer only, suppress all cards (rollup questions like "what languages?", "how many frameworks?")
   * - null/omit: show cards based on evidence stage's uiHints (default - evidence decides which cards)
   */
  uiTarget?: UiTarget | null;
  debugNotes?: string | null;
};

/**
 * Derived behavior computed from intent (per spec §4.2).
 * These are NOT LLM outputs - they are computed by the orchestrator.
 */
type DerivedPlanBehavior = {
  answerMode: AnswerMode;
  enumerateAllRelevant: boolean;
};

/**
 * Derives answerMode and enumerateAllRelevant from intent (per spec §4.2).
 */
export function deriveFromIntent(intent: Intent): DerivedPlanBehavior {
  switch (intent) {
    case 'fact_check':
      return { answerMode: 'binary_with_evidence', enumerateAllRelevant: false };
    case 'enumerate':
      return { answerMode: 'overview_list', enumerateAllRelevant: true };
    case 'describe':
      return { answerMode: 'narrative_with_examples', enumerateAllRelevant: false };
    case 'compare':
      return { answerMode: 'narrative_with_examples', enumerateAllRelevant: false };
    case 'meta':
      return { answerMode: 'meta_chitchat', enumerateAllRelevant: false };
  }
}

/**
 * Full RetrievalPlan = LLM output + derived fields.
 * Used throughout the pipeline after the orchestrator computes derived behavior.
 */
export type RetrievalPlan = PlannerLLMOutput & DerivedPlanBehavior;

type EvidenceItemSource = 'project' | 'resume' | 'profile';

export type EvidenceItem = {
  source: EvidenceItemSource;
  id: string;
  title: string;
  snippet: string;
  relevance: 'high' | 'medium' | 'low';
};

export type HighLevelAnswer = 'yes' | 'no' | 'partial' | 'unknown' | 'not_applicable';

export type EvidenceCompleteness = 'strong' | 'weak' | 'none';

type SemanticFlagType = 'uncertain' | 'ambiguous' | 'multi_topic' | 'off_topic' | 'needs_clarification';

export type SemanticFlag = {
  type: SemanticFlagType;
  reason: string;
};

export type EvidenceUiHints = {
  /**
   * Project IDs chosen by the Evidence stage, ordered by priority.
   * Must be a subset of retrieved project doc ids.
   */
  projects: string[];
  /**
   * Resume experience IDs chosen by the Evidence stage, ordered by priority.
   * Must be a subset of retrieved resume experience doc ids.
   */
  experiences: string[];
};

export type EvidenceSummary = {
  highLevelAnswer: HighLevelAnswer;
  evidenceCompleteness: EvidenceCompleteness;
  reasoning: string;
  selectedEvidence: EvidenceItem[];
  semanticFlags: SemanticFlag[];
  uiHints?: EvidenceUiHints | null;
  uiHintWarnings?: UiHintValidationWarning[];
};

export type UiPayload = {
  showProjects: string[];
  showExperiences: string[];
  bannerText?: string;
  coreEvidenceIds?: string[];
};

export type AnswerPayload = {
  message: string;
  thoughts: string[] | null;
  uiHints: EvidenceUiHints | null;
};

export const RETRIEVAL_SOURCE_VALUES = ['projects', 'resume', 'profile'] as const;
export const ANSWER_MODE_VALUES = ['binary_with_evidence', 'overview_list', 'narrative_with_examples', 'meta_chitchat'] as const;
export const ANSWER_LENGTH_VALUES = ['short', 'medium', 'detailed'] as const;
export const INTENT_VALUES = ['fact_check', 'enumerate', 'describe', 'compare', 'meta'] as const;
export const UI_TARGET_VALUES = ['text'] as const;
export const RESUME_FACET_VALUES = ['experience', 'education', 'award', 'skill'] as const;
export const EVIDENCE_SOURCE_VALUES = ['project', 'resume', 'profile'] as const;
export const SEMANTIC_FLAG_VALUES = ['uncertain', 'ambiguous', 'multi_topic', 'off_topic', 'needs_clarification'] as const;
export const RETRIEVAL_REQUEST_TOPK_MAX = 10;

const RetrievalRequestSchema: z.ZodType<RetrievalRequest, z.ZodTypeDef, unknown> = z.object({
  source: z.enum(RETRIEVAL_SOURCE_VALUES),
  queryText: z.string().default(''),
  topK: z.number().int().min(0).default(8),
});

/**
 * Schema for parsing raw Planner LLM output (per spec §4.2).
 * Does NOT include derived fields - those are computed by the orchestrator.
 */
export const PlannerLLMOutputSchema: z.ZodType<PlannerLLMOutput, z.ZodTypeDef, unknown> = z.object({
  intent: z.enum(INTENT_VALUES).default('describe'),
  topic: z.string().nullable().default(null),
  plannerConfidence: z.number().min(0).max(1).default(0.6),
  isFollowup: z.boolean().default(false),
  experienceScope: z.enum(['employment_only', 'any_experience']).nullable().default(null),
  retrievalRequests: z.array(RetrievalRequestSchema).default([]),
  resumeFacets: z.array(z.enum(RESUME_FACET_VALUES)).default([]),
  answerLengthHint: z.enum(ANSWER_LENGTH_VALUES).default('medium'),
  uiTarget: z.enum(UI_TARGET_VALUES).nullable().default(null),
  debugNotes: z.string().max(600).nullable().default(null),
});

/**
 * Schema for full RetrievalPlan (LLM output + derived fields + optional extras).
 * Used after the orchestrator has computed derived behavior.
 */
const EvidenceItemSchema: z.ZodType<EvidenceItem, z.ZodTypeDef, unknown> = z.object({
  source: z.enum(EVIDENCE_SOURCE_VALUES),
  id: z.string(),
  title: z.string().default(''),
  snippet: z.string().default(''),
  relevance: z.enum(['high', 'medium', 'low']).default('medium'),
});

const SemanticFlagSchema: z.ZodType<SemanticFlag, z.ZodTypeDef, unknown> = z.object({
  type: z.enum(SEMANTIC_FLAG_VALUES),
  reason: z.string().default(''),
});

const UiHintValidationWarningSchema: z.ZodType<UiHintValidationWarning, z.ZodTypeDef, unknown> = z.object({
  code: z.enum(['UIHINT_INVALID_PROJECT_ID', 'UIHINT_INVALID_EXPERIENCE_ID']),
  invalidIds: z.array(z.string()).default([]),
  retrievedIds: z.array(z.string()).default([]),
});

const EvidenceUiHintsSchema: z.ZodType<EvidenceUiHints, z.ZodTypeDef, unknown> = z.object({
  projects: z.array(z.string()).default([]),
  experiences: z.array(z.string()).default([]),
});

export const AnswerPayloadSchema: z.ZodType<AnswerPayload, z.ZodTypeDef, unknown> = z.object({
  message: z.string(),
  thoughts: z.array(z.string()).nullable(),
  uiHints: EvidenceUiHintsSchema.nullable(),
});

export type UiHintValidationWarning = {
  code: 'UIHINT_INVALID_PROJECT_ID' | 'UIHINT_INVALID_EXPERIENCE_ID';
  invalidIds: string[];
  retrievedIds: string[];
};

export const EvidenceSummarySchema: z.ZodType<EvidenceSummary, z.ZodTypeDef, unknown> = z.object({
  highLevelAnswer: z.enum(['yes', 'no', 'partial', 'unknown', 'not_applicable']).default('unknown'),
  evidenceCompleteness: z.enum(['strong', 'weak', 'none']).default('none'),
  reasoning: z.string().default(''),
  selectedEvidence: z.array(EvidenceItemSchema).default([]),
  semanticFlags: z.array(SemanticFlagSchema).default([]),
  uiHints: EvidenceUiHintsSchema.default({ projects: [], experiences: [] }),
  uiHintWarnings: z.array(UiHintValidationWarningSchema).default([]),
});

export type RetrievalSummary = {
  source: RetrievalSource;
  queryText: string;
  requestedTopK: number;
  effectiveTopK: number;
  numResults: number;
};

export type ReasoningStage = 'plan' | 'retrieval' | 'evidence' | 'answer';

export type ReasoningTraceError = {
  stage?: ReasoningStage | 'unknown';
  message: string;
  code?: string;
  retryable?: boolean;
  retryAfterMs?: number;
};

type ReasoningAnswerMeta = {
  model: string;
  answerMode: AnswerMode;
  answerLengthHint: AnswerLengthHint;
  thoughts?: string[];
};

export type PartialReasoningTrace = {
  plan: RetrievalPlan | null;
  retrieval: RetrievalSummary[] | null;
  evidence: EvidenceSummary | null;
  answerMeta: ReasoningAnswerMeta | null;
  uiHintWarnings?: UiHintValidationWarning[] | null;
  error?: ReasoningTraceError | null;
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
  sourceHash: string;
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
