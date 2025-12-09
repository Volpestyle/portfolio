import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PreprocessError, PREPROCESS_ERROR_CODES } from '../errors';
import type { PreprocessContext, PreprocessTaskResult } from '../types';
import { normalizeDistinctStrings } from '../utils';

type ProfileSource = {
  updatedAt?: string;
  fullName: string;
  headline: string;
  currentLocation?: string;
  currentRole?: string;
  about: string | string[];
  topSkills?: string[];
  systemPersona?: string;
  shortAbout?: string;
  styleGuidelines?: string[] | string;
  voiceExamples?: string[] | string;
  featuredExperienceIds?: string[];
  socialLinks?: Array<{
    platform: string;
    label: string;
    url: string;
    blurb?: string;
  }>;
  retrievalTriggers?: string[];
};

type ExperienceRecord = {
  id: string;
  company: string;
  title: string;
  startDate: string;
  endDate?: string | null;
  isCurrent: boolean;
  location?: string;
};

type ExperiencesFile = {
  experiences: ExperienceRecord[];
};

type FeaturedExperience = ExperienceRecord;

async function loadJson<T>(filePath: string): Promise<T | null> {
  try {
    const contents = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(contents) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function ensureRequired(value: string | undefined, field: string): string {
  if (!value?.trim()) {
    throw new PreprocessError(PREPROCESS_ERROR_CODES.PROFILE_INVALID, `Profile ${field} is required`);
  }
  return value.trim();
}

export async function runProfileTask(context: PreprocessContext): Promise<PreprocessTaskResult> {
  const sourcePath = context.paths.profileSource;
  const experiencesPath = context.paths.experiencesOutput;
  const outputPath = context.paths.profileOutput;
  const rootDir = context.paths.rootDir;

  const profileSource = await loadJson<ProfileSource>(sourcePath);
  if (!profileSource) {
    throw new PreprocessError(
      PREPROCESS_ERROR_CODES.PROFILE_REQUIRED,
      `Profile source not found at ${path.relative(rootDir, sourcePath)}`
    );
  }

  const experiencesFile = await loadJson<ExperiencesFile>(experiencesPath);
  const experienceMap = new Map<string, ExperienceRecord>();
  if (experiencesFile?.experiences) {
    for (const experience of experiencesFile.experiences) {
      experienceMap.set(experience.id, experience);
    }
  }

  const featuredExperienceIds = profileSource.featuredExperienceIds ?? [];
  const featuredExperiences: FeaturedExperience[] = [];
  for (const id of featuredExperienceIds) {
    const record = experienceMap.get(id);
    if (!record) {
      console.warn(`[profile] Skipping unknown featured experience ${id}`);
      continue;
    }
    featuredExperiences.push(record);
  }

  const aboutList = Array.isArray(profileSource.about)
    ? profileSource.about
    : typeof profileSource.about === 'string'
      ? [profileSource.about]
      : [];
  const about = aboutList.map((paragraph) => paragraph.trim()).filter(Boolean);
  if (!about.length) {
    throw new PreprocessError(
      PREPROCESS_ERROR_CODES.PROFILE_INVALID,
      'Profile about section requires at least one paragraph'
    );
  }

  const currentExperience =
    Array.from(experienceMap.values())
      .filter((exp) => exp.isCurrent)
      .sort((a, b) => (a.startDate < b.startDate ? 1 : -1))
      .map((exp) => `${exp.title} @ ${exp.company}`)[0] || profileSource.currentRole?.trim();

  const aboutString = about.join('\n\n');
  const styleGuidelineList = Array.isArray(profileSource.styleGuidelines)
    ? profileSource.styleGuidelines
    : typeof profileSource.styleGuidelines === 'string'
      ? [profileSource.styleGuidelines]
      : [];
  const styleGuidelines = normalizeDistinctStrings(styleGuidelineList);
  const voiceExampleList = Array.isArray(profileSource.voiceExamples)
    ? profileSource.voiceExamples
    : typeof profileSource.voiceExamples === 'string'
      ? [profileSource.voiceExamples]
      : [];
  const voiceExamples = normalizeDistinctStrings(voiceExampleList);

  const profile = {
    updatedAt: profileSource.updatedAt ?? 'unspecified',
    fullName: ensureRequired(profileSource.fullName, 'fullName'),
    headline: ensureRequired(profileSource.headline, 'headline'),
    currentLocation: profileSource.currentLocation?.trim(),
    currentRole: currentExperience || undefined,
    about: aboutString,
    topSkills: normalizeDistinctStrings(profileSource.topSkills),
    systemPersona: profileSource.systemPersona?.trim() || undefined,
    shortAbout: profileSource.shortAbout?.trim() || undefined,
    styleGuidelines: styleGuidelines.length ? styleGuidelines : undefined,
    voiceExamples: voiceExamples.length ? voiceExamples : undefined,
    featuredExperiences,
    resumeFilename: context.config.resume.filename,
    socialLinks: Array.isArray(profileSource.socialLinks)
      ? profileSource.socialLinks
        .map((link) => ({
          platform: link.platform?.trim(),
          label: link.label?.trim(),
          url: link.url?.trim(),
          blurb: link.blurb?.trim() || undefined,
        }))
        .filter((link) => link.platform && link.label && link.url)
      : undefined,
    retrievalTriggers: normalizeDistinctStrings(profileSource.retrievalTriggers),
  };

  const artifact = await context.artifacts.writeJson({
    id: 'profile',
    filePath: outputPath,
    data: profile,
  });

  return {
    description: 'Wrote normalized profile payload',
    counts: [
      { label: 'Top skills', value: profile.topSkills.length },
      { label: 'Style guidelines', value: styleGuidelines.length },
      { label: 'Voice examples', value: voiceExamples.length },
      { label: 'Featured experiences', value: featuredExperiences.length },
    ],
    artifacts: [{ path: artifact.relativePath, note: profile.updatedAt }],
  };
}
