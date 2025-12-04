import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PreprocessError, PREPROCESS_ERROR_CODES } from '../errors';
import type { PreprocessContext, PreprocessTaskResult } from '../types';
import { normalizeDistinctStrings } from '../utils';

export type RawExperience = {
  id?: string;
  company: string;
  title: string;
  location?: string;
  startDate: string;
  endDate?: string | null;
  summary?: string;
  bullets?: string[];
  skills?: string[];
  linkedProjects?: string[];
  experienceType?: 'full_time' | 'internship' | 'contract' | 'freelance' | 'other';
  impactSummary?: string;
  sizeOrScope?: string;
};

export type RawEducation = {
  id?: string;
  institution: string;
  degree?: string;
  field?: string;
  location?: string;
  startDate?: string;
  endDate?: string | null;
  summary?: string;
  bullets?: string[];
  skills?: string[];
};

export type RawAward = {
  id?: string;
  title: string;
  issuer?: string;
  date?: string | null;
  summary?: string;
  bullets?: string[];
  skills?: string[];
};

export type RawSkill = {
  id?: string;
  name: string;
  category?: string;
  summary?: string;
  skills?: string[];
};

export type ResumeSource = {
  snapshotDate?: string;
  experiences: RawExperience[];
  education?: RawEducation[];
  awards?: RawAward[];
  skills?: RawSkill[];
};

export type NormalizedExperience = {
  type: 'experience';
  id: string;
  slug: string;
  company: string;
  title: string;
  location?: string;
  startDate: string;
  endDate?: string | null;
  isCurrent: boolean;
  experienceType: 'full_time' | 'internship' | 'contract' | 'freelance' | 'other';
  summary?: string;
  bullets: string[];
  skills: string[];
  linkedProjects: string[];
  monthsOfExperience?: number | null;
  impactSummary?: string;
  sizeOrScope?: string;
};

export type NormalizedEducation = {
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
  bullets: string[];
  skills: string[];
};

export type NormalizedAward = {
  type: 'award';
  id: string;
  title: string;
  issuer?: string;
  date?: string | null;
  summary?: string;
  bullets: string[];
  skills: string[];
};

export type NormalizedSkill = {
  type: 'skill';
  id: string;
  name: string;
  category?: string;
  summary?: string;
  skills: string[];
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function normalizeDate(value: string, field: string): string {
  if (!value) {
    throw new PreprocessError(PREPROCESS_ERROR_CODES.RESUME_FIELD_INVALID, `Experience ${field} is required`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new PreprocessError(
      PREPROCESS_ERROR_CODES.RESUME_FIELD_INVALID,
      `Experience ${field} must be a valid date (received ${value})`
    );
  }
  return parsed.toISOString().split('T')[0] ?? value;
}

function diffInMonths(startDate: string, endDate?: string | null) {
  if (!endDate) {
    return null;
  }
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth() + 1);
  return months > 0 ? months : null;
}

export function detectExperienceType(raw: RawExperience): NormalizedExperience['experienceType'] {
  if (
    raw.experienceType &&
    ['full_time', 'internship', 'contract', 'freelance', 'other'].includes(raw.experienceType)
  ) {
    return raw.experienceType;
  }
  const haystack = `${raw.title ?? ''} ${raw.summary ?? ''}`.toLowerCase();
  if (haystack.includes('intern')) {
    return 'internship';
  }
  if (haystack.includes('contract') || haystack.includes('contractor')) {
    return 'contract';
  }
  if (haystack.includes('freelance') || haystack.includes('consultant')) {
    return 'freelance';
  }
  return 'full_time';
}

function normalizeExperience(raw: RawExperience): NormalizedExperience {
  if (!raw.company) {
    throw new PreprocessError(PREPROCESS_ERROR_CODES.RESUME_FIELD_INVALID, 'Experience company is required');
  }
  if (!raw.title) {
    throw new PreprocessError(PREPROCESS_ERROR_CODES.RESUME_FIELD_INVALID, 'Experience title is required');
  }
  const slugSeed = `${raw.company}-${raw.title}`.trim() || randomUUID();
  const slug = slugify(slugSeed) || slugify(randomUUID());
  const id = raw.id?.trim() || slug;
  const startDate = normalizeDate(raw.startDate, 'startDate');
  const endDate = raw.endDate ? normalizeDate(raw.endDate, 'endDate') : null;
  const bullets = normalizeDistinctStrings(raw.bullets);
  const skills = normalizeDistinctStrings(raw.skills);
  const linkedProjects = normalizeDistinctStrings(raw.linkedProjects);
  const experienceType = detectExperienceType(raw);

  return {
    type: 'experience',
    id,
    slug,
    company: raw.company.trim(),
    title: raw.title.trim(),
    location: raw.location?.trim() || undefined,
    startDate,
    endDate,
    isCurrent: !endDate,
    experienceType,
    summary: raw.summary?.trim() || undefined,
    impactSummary: raw.impactSummary?.trim() || undefined,
    sizeOrScope: raw.sizeOrScope?.trim() || undefined,
    bullets,
    skills,
    linkedProjects,
    monthsOfExperience: diffInMonths(startDate, endDate),
  };
}

function normalizeEducation(raw: RawEducation): NormalizedEducation {
  const id = raw.id?.trim() || slugify(raw.institution || raw.degree || randomUUID());
  return {
    type: 'education',
    id,
    institution: raw.institution?.trim() || '',
    degree: raw.degree?.trim() || undefined,
    field: raw.field?.trim() || undefined,
    location: raw.location?.trim() || undefined,
    startDate: raw.startDate ? normalizeDate(raw.startDate, 'startDate') : undefined,
    endDate: raw.endDate ? normalizeDate(raw.endDate, 'endDate') : undefined,
    isCurrent: raw.endDate == null,
    summary: raw.summary?.trim() || undefined,
    bullets: normalizeDistinctStrings(raw.bullets),
    skills: normalizeDistinctStrings(raw.skills),
  };
}

function normalizeAward(raw: RawAward): NormalizedAward {
  const id = raw.id?.trim() || slugify(raw.title || randomUUID());
  return {
    type: 'award',
    id,
    title: raw.title?.trim() || '',
    issuer: raw.issuer?.trim() || undefined,
    date: raw.date ? normalizeDate(raw.date, 'date') : undefined,
    summary: raw.summary?.trim() || undefined,
    bullets: normalizeDistinctStrings(raw.bullets),
    skills: normalizeDistinctStrings(raw.skills),
  };
}

function normalizeSkill(raw: RawSkill): NormalizedSkill {
  const id = raw.id?.trim() || slugify(raw.name || randomUUID());
  return {
    type: 'skill',
    id,
    name: raw.name?.trim() || '',
    category: raw.category?.trim() || undefined,
    summary: raw.summary?.trim() || undefined,
    skills: normalizeDistinctStrings(raw.skills),
  };
}

export async function runResumeTask(context: PreprocessContext): Promise<PreprocessTaskResult> {
  const sourcePath = context.paths.resumeJson;
  const outputPath = context.paths.experiencesOutput;
  const rootDir = context.paths.rootDir;
  const relativeSource = path.relative(rootDir, sourcePath);

  const sourceExists = await fs
    .access(sourcePath)
    .then(() => true)
    .catch(() => false);
  const resolvedSourcePath = sourceExists ? sourcePath : null;

  if (!resolvedSourcePath) {
    throw new PreprocessError(PREPROCESS_ERROR_CODES.NO_RESUME, `Resume source file not found at ${relativeSource}`);
  }

  const rawContents = await fs.readFile(resolvedSourcePath, 'utf-8');
  const parsed = JSON.parse(rawContents) as ResumeSource;
  if (!Array.isArray(parsed.experiences)) {
    throw new PreprocessError(
      PREPROCESS_ERROR_CODES.RESUME_SOURCE_INVALID,
      'Resume source must include an experiences array'
    );
  }

  const normalized = parsed.experiences.map(normalizeExperience).sort((a, b) => {
    if (a.startDate === b.startDate) {
      return 0;
    }
    return a.startDate < b.startDate ? 1 : -1;
  });

  const education = Array.isArray(parsed.education) ? parsed.education.map(normalizeEducation) : [];
  const awards = Array.isArray(parsed.awards) ? parsed.awards.map(normalizeAward) : [];
  const skills = Array.isArray(parsed.skills) ? parsed.skills.map(normalizeSkill) : [];

  const snapshotDate = parsed.snapshotDate ?? 'unspecified';
  const payload = { snapshotDate, experiences: normalized, education, awards, skills };
  const artifact = await context.artifacts.writeJson({
    id: 'resume',
    filePath: outputPath,
    data: payload,
  });

  return {
    description: `Normalized ${normalized.length} experiences, ${education.length} education entries`,
    counts: [
      { label: 'Experiences', value: normalized.length },
      { label: 'Education', value: education.length },
      { label: 'Awards', value: awards.length },
      { label: 'Skills', value: skills.length },
    ],
    artifacts: [{ path: artifact.relativePath, note: `snapshot ${snapshotDate}` }],
  };
}
