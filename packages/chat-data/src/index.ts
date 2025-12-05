import { z } from 'zod';
import { SOCIAL_PLATFORM_VALUES, type ExperienceRecord, type EducationRecord, type AwardRecord, type SkillRecord, type ResumeEntry, type ProfileSummary, type ProjectContext, type SocialPlatform } from '@portfolio/chat-contract';

const projectTimeframeSchema = z
  .object({
    start: z.string().optional(),
    end: z.string().optional(),
  })
  .optional();

const projectContextSchema: z.ZodType<ProjectContext> = z.object({
  type: z.enum(['personal', 'work', 'oss', 'academic', 'other']),
  organization: z.string().optional(),
  role: z.string().optional(),
  timeframe: projectTimeframeSchema,
});

const projectSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  oneLiner: z.string(),
  description: z.string(),
  impactSummary: z.string().optional(),
  sizeOrScope: z.string().optional(),
  techStack: z.array(z.string()),
  languages: z.array(z.string()),
  tags: z.array(z.string()),
  context: projectContextSchema,
  contextType: z.enum(['personal', 'work', 'oss', 'academic', 'other']).optional(),
  githubUrl: z.string().url().optional(),
  liveUrl: z.string().url().optional(),
});

const projectDetailSchema = projectSummarySchema.extend({
  bullets: z.array(z.string()),
  readme: z.string(),
});

export const projectRecordSchema = projectDetailSchema.extend({
  embeddingId: z.string(),
});

export const projectDatasetSchema = z.object({
  generatedAt: z.string(),
  projects: z.array(projectRecordSchema),
});

export type ProjectRecord = z.infer<typeof projectRecordSchema>;
export type ProjectDataset = z.infer<typeof projectDatasetSchema>;

const socialPlatformSchema = z.enum(SOCIAL_PLATFORM_VALUES);

const embeddingIndexMetaSchema = z.object({
  schemaVersion: z.number(),
  buildId: z.string(),
});

const embeddingEntrySchema = z.object({
  id: z.string(),
  vector: z.array(z.number()),
});

export const embeddingIndexSchema = z.object({
  meta: embeddingIndexMetaSchema,
  entries: z.array(embeddingEntrySchema),
});

export type EmbeddingIndexMeta = z.infer<typeof embeddingIndexMetaSchema>;
export type EmbeddingEntry = z.infer<typeof embeddingEntrySchema>;
export type EmbeddingIndex = z.infer<typeof embeddingIndexSchema>;

export function assertProjectDataset(data: unknown): ProjectDataset {
  return projectDatasetSchema.parse(data);
}

export const experienceRecordSchema: z.ZodType<ExperienceRecord> = z.object({
  type: z.literal('experience').optional(),
  id: z.string(),
  slug: z.string(),
  company: z.string(),
  title: z.string(),
  location: z.string().optional(),
  startDate: z.string(),
  endDate: z.string().nullable().optional(),
  isCurrent: z.boolean(),
  experienceType: z.enum(['full_time', 'internship', 'contract', 'freelance', 'other']).optional(),
  summary: z.string().optional(),
  bullets: z.array(z.string()),
  skills: z.array(z.string()),
  linkedProjects: z.array(z.string()),
  monthsOfExperience: z.number().nullable().optional(),
  impactSummary: z.string().optional(),
  sizeOrScope: z.string().optional(),
});

export const educationRecordSchema: z.ZodType<EducationRecord> = z.object({
  type: z.literal('education'),
  id: z.string(),
  institution: z.string(),
  degree: z.string().optional(),
  field: z.string().optional(),
  location: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  isCurrent: z.boolean().optional(),
  summary: z.string().optional(),
  bullets: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
});

export const awardRecordSchema: z.ZodType<AwardRecord> = z.object({
  type: z.literal('award'),
  id: z.string(),
  title: z.string(),
  issuer: z.string().optional(),
  date: z.string().optional(),
  summary: z.string().optional(),
  bullets: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
});

export const skillRecordSchema: z.ZodType<SkillRecord> = z.object({
  type: z.literal('skill'),
  id: z.string(),
  name: z.string(),
  category: z.string().optional(),
  summary: z.string().optional(),
  skills: z.array(z.string()).optional(),
});

export const resumeEntrySchema: z.ZodType<ResumeEntry> = z.union([
  experienceRecordSchema,
  educationRecordSchema,
  awardRecordSchema,
  skillRecordSchema,
]);

export const experienceDatasetSchema = z.object({
  snapshotDate: z.string().optional(),
  experiences: z.array(experienceRecordSchema),
});

export const resumeDatasetSchema = z.object({
  snapshotDate: z.string().optional(),
  experiences: z.array(experienceRecordSchema),
  education: z.array(educationRecordSchema).optional(),
  awards: z.array(awardRecordSchema).optional(),
  skills: z.array(skillRecordSchema).optional(),
});

export type ExperienceDataset = z.infer<typeof experienceDatasetSchema>;
export type ResumeDataset = z.infer<typeof resumeDatasetSchema>;

export const profileSummarySchema: z.ZodType<ProfileSummary> = z.object({
  updatedAt: z.string().optional(),
  fullName: z.string(),
  headline: z.string(),
  location: z.string().optional(),
  currentRole: z.string().optional(),
  about: z.union([z.array(z.string()), z.string()]),
  topSkills: z.array(z.string()),
  systemPersona: z.string().optional(),
  shortAbout: z.string().optional(),
  styleGuidelines: z.array(z.string()).optional(),
  voiceExamples: z.array(z.string()).optional(),
  featuredExperiences: z.array(experienceRecordSchema).optional(),
  socialLinks: z
    .array(
      z.object({
        platform: socialPlatformSchema as z.ZodType<SocialPlatform>,
        label: z.string(),
        url: z.string(),
        blurb: z.string().optional(),
      })
    )
    .optional(),
});

export function assertProjectEmbeddings(data: unknown): EmbeddingIndex {
  return embeddingIndexSchema.parse(data);
}

export function assertExperienceEmbeddings(data: unknown): EmbeddingIndex {
  return embeddingIndexSchema.parse(data);
}

export function assertResume(data: unknown): ResumeDataset {
  return resumeDatasetSchema.parse(data);
}
export function assertProfileSummary(data: unknown): ProfileSummary {
  return profileSummarySchema.parse(data);
}

export type {
  ResumeSearchQuery,
  ResumeSearchLogPayload,
  ResumeSearcher,
  ResumeSearcherOptions,
} from './search/resumeSearcher';
export { createResumeSearcher, buildResumeSearchIndex } from './search/resumeSearcher';

export function createProfileProvider(profile: ProfileSummary): {
  getProfile: () => Promise<ProfileSummary>;
} {
  async function getProfile(): Promise<ProfileSummary> {
    return {
      ...profile,
    };
  }

  return { getProfile };
}

export type {
  RepoData,
  ExperienceRecord,
  EducationRecord,
  AwardRecord,
  SkillRecord,
  ResumeEntry,
  ProfileSummary,
  ProfileSocialLink,
  ProjectSearchResult,
} from '@portfolio/chat-contract';
export type {
  EmbeddingProvider,
  ExperienceRepository,
  ProjectProviders,
  ProjectRepository,
  ProjectDetailProvider,
  ProjectSearchIndexEntry,
  ProfileRepository,
} from './providers/types';

export { buildProjectDetail, buildProjectSummary, buildProjectSearchResult } from './projects';
export {
  createFilesystemProjectRepository,
  createFilesystemExperienceRepository,
  createFilesystemProfileRepository,
} from './providers/filesystem';
export { createProjectDetailProvider } from './providers/projectDetail';
export { cosineSimilarity, createEmbeddingSemanticRanker, type SemanticRanker } from './search/semantic';
export { createExperienceEmbeddingSemanticRanker, type ExperienceSemanticRanker } from './search/experienceSemantic';
export { createProjectSearcher, type ProjectSearcher, type ProjectSearchLogPayload } from './search/projectSearcher';
export {
  createSearcher,
  type SearchSpec,
  type SearcherOptions,
  type SearchLogPayload,
  type SearchContext,
  type SearchWeights,
} from './search/createSearcher';
