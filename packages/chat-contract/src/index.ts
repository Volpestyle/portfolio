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
  systemPersona?: string;
  shortAbout?: string;
  styleGuidelines?: string[];
  voiceExamples?: string[];
  featuredExperiences?: ExperienceRecord[];
  socialLinks?: ProfileSocialLink[];
};

export type PersonaSummary = {
  systemPersona: string;
  shortAbout: string;
  styleGuidelines: string[];
  voiceExamples?: string[];
  generatedAt?: string;
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
  answerTemperature?: number;
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
export type QuestionType = 'binary' | 'list' | 'narrative' | 'meta';
export type EnumerationMode = 'sample' | 'all_relevant';
export type RetrievalSource = 'projects' | 'resume' | 'profile';

export type ExperienceScope = 'employment_only' | 'any_experience';

export type ResumeFacet = 'experience' | 'education' | 'award' | 'skill';

export type RetrievalRequest = {
  source: RetrievalSource;
  queryText: string;
  topK: number;
};

export type PlannerLLMOutput = {
  // Core axes
  questionType: QuestionType;
  enumeration: EnumerationMode;
  scope: ExperienceScope;

  // Retrieval instructions
  retrievalRequests: RetrievalRequest[];
  resumeFacets?: ResumeFacet[];

  // UI / presentation hints
  cardsEnabled?: boolean;

  // Telemetry only
  topic?: string | null;
};

// Full RetrievalPlan (identical to planner output; kept as a separate alias for clarity)
export type RetrievalPlan = PlannerLLMOutput;

type EvidenceItemSource = 'project' | 'resume' | 'profile';

export type EvidenceItem = {
  source: EvidenceItemSource;
  id: string;
  title: string;
  snippet: string;
  relevance: 'high' | 'medium' | 'low';
};

export type Verdict = 'yes' | 'no_evidence' | 'partial_evidence' | 'n/a';

export type Confidence = 'high' | 'medium' | 'low';

type SemanticFlagType = 'multi_topic' | 'ambiguous' | 'needs_clarification' | 'off_topic';

export type SemanticFlag = {
  type: SemanticFlagType;
  reason: string;
};

export type EvidenceUiHints = {
  /**
   * Project IDs chosen by the Evidence stage, ordered by priority.
   * Must be a subset of retrieved project doc ids.
   */
  projects?: string[];
  /**
   * Resume experience IDs chosen by the Evidence stage, ordered by priority.
   * Must be a subset of retrieved resume experience doc ids.
   */
  experiences?: string[];
};

export type EvidenceSummary = {
  verdict: Verdict;
  confidence: Confidence;
  reasoning: string;
  selectedEvidence: EvidenceItem[];
  semanticFlags?: SemanticFlag[];
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
  thoughts?: string[] | null;
};

export const RETRIEVAL_SOURCE_VALUES = ['projects', 'resume', 'profile'] as const;
export const QUESTION_TYPE_VALUES = ['binary', 'list', 'narrative', 'meta'] as const;
export const ENUMERATION_VALUES = ['sample', 'all_relevant'] as const;
export const VERDICT_VALUES = ['yes', 'no_evidence', 'partial_evidence', 'n/a'] as const;
export const CONFIDENCE_VALUES = ['high', 'medium', 'low'] as const;
export const RESUME_FACET_VALUES = ['experience', 'education', 'award', 'skill'] as const;
export const EVIDENCE_SOURCE_VALUES = ['project', 'resume', 'profile'] as const;
export const SEMANTIC_FLAG_VALUES = ['multi_topic', 'ambiguous', 'needs_clarification', 'off_topic'] as const;
export const RETRIEVAL_REQUEST_TOPK_MAX = 10;

const RetrievalRequestSchema: z.ZodType<RetrievalRequest, z.ZodTypeDef, unknown> = z.object({
  source: z.enum(RETRIEVAL_SOURCE_VALUES),
  queryText: z.string().default(''),
  topK: z.number().int().min(0).default(8),
});

/**
 * Schema for parsing raw Planner LLM output (per spec §4.2).
 */
export const PlannerLLMOutputSchema: z.ZodType<PlannerLLMOutput, z.ZodTypeDef, unknown> = z.object({
  questionType: z.enum(QUESTION_TYPE_VALUES).default('narrative'),
  enumeration: z.enum(ENUMERATION_VALUES).default('sample'),
  scope: z.enum(['employment_only', 'any_experience']).default('any_experience'),
  retrievalRequests: z.array(RetrievalRequestSchema).default([]),
  resumeFacets: z.array(z.enum(RESUME_FACET_VALUES)).default([]),
  cardsEnabled: z.boolean().default(true),
  topic: z.string().nullable().optional(),
});

/**
 * Schema for EvidenceSummary and related data.
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
  thoughts: z.array(z.string()).optional().nullable(),
});

export type UiHintValidationWarning = {
  code: 'UIHINT_INVALID_PROJECT_ID' | 'UIHINT_INVALID_EXPERIENCE_ID';
  invalidIds: string[];
  retrievedIds: string[];
};

export const EvidenceSummarySchema: z.ZodType<EvidenceSummary, z.ZodTypeDef, unknown> = z.object({
  verdict: z.enum(VERDICT_VALUES).default('no_evidence'),
  confidence: z.enum(CONFIDENCE_VALUES).default('low'),
  reasoning: z.string().default(''),
  selectedEvidence: z.array(EvidenceItemSchema).default([]),
  semanticFlags: z.array(SemanticFlagSchema).default([]),
  uiHints: EvidenceUiHintsSchema.default({ projects: [], experiences: [] }).nullable(),
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
  questionType: QuestionType;
  enumeration: EnumerationMode;
  scope: ExperienceScope;
  verdict: Verdict;
  confidence: Confidence;
  thoughts?: string[];
};

export type PartialReasoningTrace = {
  plan: RetrievalPlan | null;
  retrieval: RetrievalSummary[] | null;
  evidence: EvidenceSummary | null;
  answerMeta: ReasoningAnswerMeta | null;
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
