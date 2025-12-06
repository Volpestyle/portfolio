import {
  buildResumeSearchIndex,
  createProjectSearcher,
  createResumeSearcher,
  type ExperienceSemanticRanker,
  type ExperienceRepository,
  type ProfileRepository,
  type ProjectRecord,
  type ProjectRepository,
  type ProjectSearchLogPayload,
  type ProjectSearcher,
  type ResumeSearchLogPayload,
  type ResumeSearcher,
  type SemanticRanker,
  type SearchWeights,
} from '@portfolio/chat-data';
import type {
  AwardRecord,
  EducationRecord,
  ExperienceRecord,
  ExperienceScope,
  ProfileSummary,
  ProjectSearchResult,
  ScoreMetadata,
  SkillRecord,
} from '@portfolio/chat-contract';

export type ProjectDoc = ProjectRecord & ScoreMetadata;
export type ExperienceDoc = ExperienceRecord;
export type EducationDoc = EducationRecord;
export type AwardDoc = AwardRecord;
export type SkillDoc = SkillRecord;
export type ResumeDoc = ExperienceDoc | EducationDoc | AwardDoc | SkillDoc;
export type ProfileDoc = ProfileSummary;

export type RetrievalResult = {
  projects: ProjectDoc[];
  experiences: ExperienceDoc[];
  education: EducationDoc[];
  awards: AwardDoc[];
  skills: SkillDoc[];
  profile?: ProfileDoc;
};

export type RetrievalDrivers = {
  searchProjectsByText(queryText: string, topK?: number, options?: { scope?: ExperienceScope }): Promise<ProjectDoc[]>;
  searchExperiencesByText(queryText: string, topK?: number): Promise<ResumeDoc[]>;
  getProfileDoc(): Promise<ProfileDoc | undefined>;
};

export type RetrievalOptions = {
  projectRepository: ProjectRepository;
  experienceRepository: ExperienceRepository;
  profileRepository: ProfileRepository;
  projectSemanticRanker?: SemanticRanker | null;
  experienceSemanticRanker?: ExperienceSemanticRanker | null;
  defaultTopK?: number;
  maxTopK?: number;
  minRelevanceScore?: number;
  logger?: (event: string, payload: Record<string, unknown>) => void;
  weights?: SearchWeights;
};

const DEFAULT_TOPK = 8;
const MAX_TOPK = 10;

const clamp = (value: number | undefined, max: number, fallback: number): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.min(max, Math.floor(value)));
};

export function createRetrieval(options: RetrievalOptions): RetrievalDrivers {
  const {
    projectRepository,
    experienceRepository,
    profileRepository,
    projectSemanticRanker,
    experienceSemanticRanker,
    logger,
  } = options;
  const defaultTopK = options.defaultTopK ?? DEFAULT_TOPK;
  const maxTopK = options.maxTopK ?? MAX_TOPK;

  let projectSearcherPromise: Promise<ProjectSearcher> | null = null;
  let resumeSearcherPromise: Promise<ResumeSearcher> | null = null;
  let projectMapPromise: Promise<Map<string, ProjectRecord>> | null = null;

  const resolveProjectMap = async (): Promise<Map<string, ProjectRecord>> => {
    if (!projectMapPromise) {
      projectMapPromise = projectRepository
        .listProjects()
        .then((records) => new Map(records.map((record) => [record.id.trim().toLowerCase(), record])));
    }
    return projectMapPromise;
  };

  async function getProjectSearcher(): Promise<ProjectSearcher> {
    if (!projectSearcherPromise) {
      projectSearcherPromise = (async () => {
        const records = await projectRepository.listProjects();
        await resolveProjectMap();
        return createProjectSearcher(records, {
          semanticRanker: projectSemanticRanker ?? undefined,
          defaultLimit: defaultTopK,
          minLimit: 1,
          maxLimit: maxTopK,
          weights: options.weights,
          logger: logger ? (payload: ProjectSearchLogPayload) => logger('retrieval.projects', payload) : undefined,
        });
      })();
    }
    return projectSearcherPromise;
  }

  async function getResumeSearcher(): Promise<ResumeSearcher> {
    if (!resumeSearcherPromise) {
      resumeSearcherPromise = (async () => {
        const records = await experienceRepository.listExperiences();
        const searchIndex = buildResumeSearchIndex(records);
        return createResumeSearcher(records, {
          semanticRanker: experienceSemanticRanker ?? undefined,
          defaultLimit: defaultTopK,
          minLimit: 1,
          maxLimit: maxTopK,
          weights: options.weights,
          searchIndex,
          logger: logger ? (payload: ResumeSearchLogPayload) => logger('retrieval.resume', payload) : undefined,
        });
      })();
    }
    return resumeSearcherPromise;
  }

  return {
    async searchProjectsByText(
      queryText: string,
      topK?: number,
      _options?: { scope?: ExperienceScope }
    ): Promise<ProjectDoc[]> {
      const searcher = await getProjectSearcher();
      const limit = clamp(topK, maxTopK, defaultTopK);
      const results = await searcher.searchProjects({ text: queryText, limit });
      const projectMap = await resolveProjectMap();
      return results.map((result) => {
        const lookup = projectMap.get(result.id.trim().toLowerCase());
        const enriched = lookup ? { ...lookup } : { ...(result as unknown as ProjectRecord) };
        if (!enriched.description && (result as ProjectSearchResult).description) {
          enriched.description = (result as ProjectSearchResult).description;
        }
        if (!enriched.oneLiner && (result as ProjectSearchResult).oneLiner) {
          enriched.oneLiner = (result as ProjectSearchResult).oneLiner;
        }
        if ((!enriched.bullets || enriched.bullets.length === 0) && (result as ProjectSearchResult).bullets) {
          enriched.bullets = (result as ProjectSearchResult).bullets;
        }
        return {
          ...enriched,
          _score: (result as ScoreMetadata)._score,
          _signals: (result as ScoreMetadata)._signals,
        };
      });
    },

    async searchExperiencesByText(queryText: string, topK?: number): Promise<ResumeDoc[]> {
      const limit = clamp(topK, maxTopK, defaultTopK);
      const searcher = await getResumeSearcher();
      const results = await searcher.searchResume({
        text: queryText,
        limit,
      });
      return results.map((result) => ({ ...result }));
    },

    async getProfileDoc(): Promise<ProfileDoc | undefined> {
      try {
        const profile = await profileRepository.getProfile();
        const about = Array.isArray(profile.about) ? profile.about : profile.about ? [profile.about] : [];
        return { ...profile, about };
      } catch (error) {
        if (logger) {
          logger('retrieval.profile.error', { error: String(error) });
        }
        return undefined;
      }
    },
  };
}
