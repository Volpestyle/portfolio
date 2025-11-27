import { promises as fs } from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import type { ResponseFormatTextJSONSchemaConfig } from 'openai/resources/responses/responses';
import { PreprocessError, PREPROCESS_ERROR_CODES } from '../errors';
import { requireEnv } from '../env';
import type { PreprocessMetrics } from '../metrics';
import type { PreprocessContext, PreprocessTaskResult } from '../types';
import { normalizeDistinctStrings } from '../utils';
import type { RawAward, RawEducation, RawExperience, RawSkill, ResumeSource } from './resume';
import { detectExperienceType } from './resume';

// pdf-parse expects DOM-like globals in Node; provide minimal stubs to avoid ReferenceErrors.
const globalAny = globalThis as Record<string, unknown>;
if (typeof globalAny.DOMMatrix === 'undefined') {
  globalAny.DOMMatrix = class DOMMatrix {};
}
if (typeof globalAny.ImageData === 'undefined') {
  globalAny.ImageData = class ImageData {};
}
if (typeof globalAny.Path2D === 'undefined') {
  globalAny.Path2D = class Path2D {};
}

type PdfParseFn = typeof import('pdf-parse').PDFParse;
let pdfParseFn: PdfParseFn | null = null;
async function getPdfParse(): Promise<PdfParseFn> {
  if (!pdfParseFn) {
    const mod = await import('pdf-parse');
    pdfParseFn = mod.PDFParse;
  }
  return pdfParseFn;
}

const LOG_PREFIX = '[resume-pdf]';
const MAX_PROMPT_CHARS = 12000;

type ExtractedExperience = {
  id?: string | null;
  company?: string | null;
  title?: string | null;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  summary?: string | null;
  bullets?: string[];
  skills?: string[];
  linkedProjects?: string[];
};

type ResumeExtraction = {
  experiences: ExtractedExperience[];
  education?: Array<Partial<RawEducation>>;
  awards?: Array<Partial<RawAward>>;
  skills?: Array<Partial<RawSkill>>;
};

function cleanResumeText(raw: string): string {
  return raw
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ +\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncateForPrompt(text: string): string {
  if (text.length <= MAX_PROMPT_CHARS) {
    return text;
  }
  return `${text.slice(0, MAX_PROMPT_CHARS)}\n\n[truncated ${text.length - MAX_PROMPT_CHARS} chars]`;
}

function extractTextFromResponse(response: OpenAI.Responses.Response): string {
  const chunks: string[] = [];
  for (const item of response.output ?? []) {
    if (item.type !== 'message' || !('content' in item)) {
      continue;
    }
    for (const content of item.content ?? []) {
      if (content.type === 'output_text') {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join('\n').trim();
}

function extractFirstJsonObject(raw: string): string {
  const start = raw.indexOf('{');
  if (start === -1) {
    return raw;
  }
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
  return raw.slice(start);
}

function toIsoDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new PreprocessError(PREPROCESS_ERROR_CODES.RESUME_FIELD_INVALID, 'Date is required');
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new PreprocessError(PREPROCESS_ERROR_CODES.RESUME_FIELD_INVALID, `Invalid date: ${value}`);
  }
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth() + 1;
  const day = parsed.getUTCDate() || 1;
  const safeDay = Number.isFinite(day) && day > 0 ? day : 1;
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${safeDay
    .toString()
    .padStart(2, '0')}`;
}

function coerceEndDate(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const lower = normalized.toLowerCase();
  if (lower === 'present' || lower === 'current' || lower === 'now') {
    return null;
  }
  return toIsoDate(normalized);
}

function dedupeMerge(primary?: string[], secondary?: string[]): string[] {
  return normalizeDistinctStrings([...(primary ?? []), ...(secondary ?? [])]);
}

function sanitizeExperience(raw: ExtractedExperience): RawExperience | null {
  const company = raw.company?.trim();
  const title = raw.title?.trim();
  const startDate = raw.startDate?.trim();
  if (!company || !title || !startDate) {
    return null;
  }
  let normalizedStart: string;
  try {
    normalizedStart = toIsoDate(startDate);
  } catch (error) {
    console.warn(`${LOG_PREFIX} Skipping ${company} (${title}) due to invalid start date:`, error);
    return null;
  }

  let normalizedEnd: string | null = null;
  try {
    normalizedEnd = coerceEndDate(raw.endDate);
  } catch (error) {
    console.warn(`${LOG_PREFIX} Ignoring invalid end date for ${company} (${title}):`, error);
  }

  const { id: _rawId, location, ...rest } = raw;
  const normalizedLocation = location?.trim() || undefined;
  const sanitizedBullets = normalizeDistinctStrings(raw.bullets);
  const sanitizedSkills = normalizeDistinctStrings(raw.skills);
  const sanitizedLinked = normalizeDistinctStrings(raw.linkedProjects);
  const sanitizedSummary = raw.summary?.trim() || undefined;
  const experienceType = detectExperienceType({
    ...rest,
    company,
    title,
    startDate: normalizedStart,
    endDate: normalizedEnd ?? undefined,
    location: normalizedLocation,
    bullets: sanitizedBullets,
    skills: sanitizedSkills,
    linkedProjects: sanitizedLinked,
    summary: sanitizedSummary,
  });

  return {
    id: raw.id?.trim() || undefined,
    company,
    title,
    location: normalizedLocation,
    startDate: normalizedStart,
    endDate: normalizedEnd,
    summary: sanitizedSummary,
    bullets: sanitizedBullets,
    skills: sanitizedSkills,
    linkedProjects: sanitizedLinked,
    experienceType,
  };
}

function sanitizeEducation(raw: Partial<RawEducation>): RawEducation | null {
  const institution = raw.institution?.trim();
  if (!institution) return null;
  return {
    id: raw.id?.trim(),
    institution,
    degree: raw.degree?.trim(),
    field: raw.field?.trim(),
    location: raw.location?.trim(),
    startDate: raw.startDate?.trim(),
    endDate: raw.endDate?.trim() ?? null,
    summary: raw.summary?.trim(),
    bullets: normalizeDistinctStrings(raw.bullets),
    skills: normalizeDistinctStrings(raw.skills),
  };
}

function sanitizeAward(raw: Partial<RawAward>): RawAward | null {
  const title = raw.title?.trim();
  if (!title) return null;
  return {
    id: raw.id?.trim(),
    title,
    issuer: raw.issuer?.trim(),
    date: raw.date?.trim(),
    summary: raw.summary?.trim(),
    bullets: normalizeDistinctStrings(raw.bullets),
    skills: normalizeDistinctStrings(raw.skills),
  };
}

function sanitizeSkill(raw: Partial<RawSkill>): RawSkill | null {
  const name = raw.name?.trim();
  if (!name) return null;
  return {
    id: raw.id?.trim(),
    name,
    category: raw.category?.trim(),
    summary: raw.summary?.trim(),
    skills: normalizeDistinctStrings(raw.skills),
  };
}

function makeMatchKey(exp: Partial<RawExperience>): string {
  return [
    exp.id?.toLowerCase() ?? '',
    exp.company?.toLowerCase() ?? '',
    exp.title?.toLowerCase() ?? '',
  ].join('::');
}

async function readExistingResume(filePath: string): Promise<ResumeSource | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as ResumeSource;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function mergeWithExisting(experiences: RawExperience[], existing: ResumeSource | null): RawExperience[] {
  if (!existing) {
    return experiences;
  }
  const existingByKey = new Map<string, RawExperience>();
  for (const exp of existing.experiences) {
    existingByKey.set(makeMatchKey(exp), exp);
  }

  return experiences.map(exp => {
    const match = existingByKey.get(makeMatchKey(exp));
    if (!match) {
      return exp;
    }
    const bullets = exp.bullets ?? [];
    const skills = exp.skills ?? [];
    return {
      ...exp,
      id: exp.id ?? match.id,
      summary: exp.summary ?? match.summary,
      bullets: bullets.length ? bullets : match.bullets,
      skills: skills.length ? dedupeMerge(skills, match.skills) : match.skills,
      linkedProjects: dedupeMerge(exp.linkedProjects, match.linkedProjects),
      location: exp.location ?? match.location,
      endDate: exp.endDate ?? match.endDate ?? null,
    };
  });
}

function mergeSections<T extends { id?: string | null }>(incoming: T[] | undefined, existing: T[] | undefined): T[] {
  const safeIncoming = incoming?.filter(Boolean) ?? [];
  if (!existing?.length) return safeIncoming;
  if (!safeIncoming.length) return existing;
  const byId = new Map<string, T>();
  for (const item of existing) {
    const key = (item.id ?? '').toString().toLowerCase();
    if (key) byId.set(key, item);
  }
  return safeIncoming.map((item) => {
    const key = (item.id ?? '').toString().toLowerCase();
    return key && byId.has(key) ? { ...byId.get(key), ...item } : item;
  });
}

async function extractExperiencesFromPdf(
  client: OpenAI,
  pdfPath: string,
  model: string,
  metrics?: PreprocessMetrics
): Promise<{
  experiences: RawExperience[];
  education: RawEducation[];
  awards: RawAward[];
  skills: RawSkill[];
}> {
  const pdfBuffer = await fs.readFile(pdfPath);
  const PdfParseCtor = await getPdfParse();
  const parser = new PdfParseCtor({ data: pdfBuffer });
  let cleaned = '';
  try {
    const result = await parser.getText();
    cleaned = cleanResumeText(result.text ?? '');
  } finally {
    await parser.destroy().catch(() => undefined);
  }
  if (!cleaned) {
    throw new PreprocessError(PREPROCESS_ERROR_CODES.PDF_UNREADABLE, 'Unable to extract text from resume PDF.');
  }

  const truncated = truncateForPrompt(cleaned);

  const schema: ResponseFormatTextJSONSchemaConfig = {
    type: 'json_schema',
    name: 'ResumeExtraction',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['experiences', 'education', 'awards', 'skills'],
      properties: {
        experiences: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'id',
              'company',
              'title',
              'location',
              'startDate',
              'endDate',
              'summary',
              'bullets',
              'skills',
              'linkedProjects',
            ],
            properties: {
              id: {
                type: ['string', 'null'],
                description: 'Optional stable identifier. Use a slug-friendly string if available.',
              },
              company: { type: 'string' },
              title: { type: 'string' },
              location: { type: ['string', 'null'] },
              startDate: {
                type: 'string',
                description: 'ISO 8601 date (YYYY-MM-01). Use the first day of the month when day is missing.',
              },
              endDate: {
                anyOf: [{ type: 'string' }, { type: 'null' }],
                description: 'ISO 8601 date or null if the role is ongoing.',
              },
              summary: {
                type: ['string', 'null'],
                description: 'One-sentence summary highlighting the impact of this role.',
              },
              bullets: {
                type: 'array',
                items: { type: 'string' },
                description: 'Up to 4 concrete accomplishment bullet points.',
                maxItems: 4,
              },
              skills: {
                type: 'array',
                items: { type: 'string' },
                description: 'Technologies, platforms, or methodologies explicitly tied to this role.',
              },
              linkedProjects: {
                type: 'array',
                items: { type: 'string' },
                description: 'Portfolio project slugs that should be associated with this experience.',
              },
            },
          },
        },
        education: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: ['string', 'null'] },
              institution: { type: 'string' },
              degree: { type: ['string', 'null'] },
              field: { type: ['string', 'null'] },
              location: { type: ['string', 'null'] },
              startDate: { type: ['string', 'null'] },
              endDate: { type: ['string', 'null'] },
              summary: { type: ['string', 'null'] },
              bullets: { type: 'array', items: { type: 'string' }, maxItems: 4 },
              skills: { type: 'array', items: { type: 'string' } },
            },
            required: ['id', 'institution', 'degree', 'field', 'location', 'startDate', 'endDate', 'summary', 'bullets', 'skills'],
          },
        },
        awards: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: ['string', 'null'] },
              title: { type: 'string' },
              issuer: { type: ['string', 'null'] },
              date: { type: ['string', 'null'] },
              summary: { type: ['string', 'null'] },
              bullets: { type: 'array', items: { type: 'string' }, maxItems: 4 },
              skills: { type: 'array', items: { type: 'string' } },
            },
            required: ['id', 'title', 'issuer', 'date', 'summary', 'bullets', 'skills'],
          },
        },
        skills: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: ['string', 'null'] },
              name: { type: 'string' },
              category: { type: ['string', 'null'] },
              summary: { type: ['string', 'null'] },
              skills: { type: 'array', items: { type: 'string' } },
            },
            required: ['id', 'name', 'category', 'summary', 'skills'],
          },
        },
      },
    },
  };

  const response = await (metrics
    ? metrics.wrapLlm(
        { stage: 'other', model, meta: { pdf: path.basename(pdfPath) } },
        () =>
          client.responses.create({
            model,
            text: { format: schema },
            input: [
              {
                role: 'system',
                content:
                  'You are a meticulous resume parser. Convert resume text into structured resume objects (experiences, education, awards, skills). Preserve factual bullet points and keep wording concise. Dates must be ISO formatted (YYYY-MM-DD).',
              },
              {
                role: 'user',
                content: `Resume text:\n${truncated}`,
              },
            ],
          })
      )
    : client.responses.create({
        model,
        text: { format: schema },
        input: [
          {
            role: 'system',
            content:
              'You are a meticulous resume parser. Convert resume text into structured resume objects (experiences, education, awards, skills). Preserve factual bullet points and keep wording concise. Dates must be ISO formatted (YYYY-MM-DD).',
          },
          {
            role: 'user',
            content: `Resume text:\n${truncated}`,
          },
        ],
      }));

  const raw = extractTextFromResponse(response);
  const cleanJson = extractFirstJsonObject(raw);
  const parsed = JSON.parse(cleanJson) as ResumeExtraction;
  const normalized: RawExperience[] = [];
  for (const candidate of parsed.experiences ?? []) {
    const sanitized = sanitizeExperience(candidate);
    if (sanitized) {
      normalized.push(sanitized);
    }
  }
  const education = (parsed.education ?? []).map(sanitizeEducation).filter(Boolean) as RawEducation[];
  const awards = (parsed.awards ?? []).map(sanitizeAward).filter(Boolean) as RawAward[];
  const skills = (parsed.skills ?? []).map(sanitizeSkill).filter(Boolean) as RawSkill[];
  return { experiences: normalized, education, awards, skills };
}

export async function runResumePdfTask(context: PreprocessContext): Promise<PreprocessTaskResult> {
  const pdfPath = context.paths.resumePdf;
  const outputPath = context.paths.resumeJson;
  const rootDir = context.paths.rootDir;

  await fs.access(pdfPath).catch(() => {
    throw new PreprocessError(
      PREPROCESS_ERROR_CODES.PDF_NOT_FOUND,
      `Resume PDF not found at ${path.relative(rootDir, pdfPath)}`
    );
  });

  const openAiKey = requireEnv('OPENAI_API_KEY', 'OPENAI_API_KEY is required for resume ingestion');
  const client = new OpenAI({ apiKey: openAiKey });
  const { resumeTextModel } = context.models;

  const [extracted, existingPrimary] = await Promise.all([
    extractExperiencesFromPdf(client, pdfPath, resumeTextModel, context.metrics),
    readExistingResume(outputPath),
  ]);
  const existing = existingPrimary;
  if (!extracted.experiences.length) {
    throw new PreprocessError(PREPROCESS_ERROR_CODES.PDF_EMPTY, 'Resume PDF did not yield any experiences.');
  }

  const mergedExperiences = mergeWithExisting(extracted.experiences, existing);
  const mergedEducation = mergeSections(extracted.education, existing?.education);
  const mergedAwards = mergeSections(extracted.awards, existing?.awards);
  const mergedSkills = mergeSections(extracted.skills, existing?.skills);
  const snapshotDate = new Date().toISOString().split('T')[0] ?? 'unspecified';
  const payload: ResumeSource = {
    snapshotDate,
    experiences: mergedExperiences,
    education: mergedEducation,
    awards: mergedAwards,
    skills: mergedSkills,
  };

  const artifact = await context.artifacts.writeJson({
    id: 'resume-raw',
    filePath: outputPath,
    data: payload,
  });

  return {
    description: `Extracted ${mergedExperiences.length} experiences from resume PDF`,
    counts: [
      { label: 'Experiences', value: mergedExperiences.length },
      { label: 'Education', value: mergedEducation.length },
      { label: 'Awards', value: mergedAwards.length },
      { label: 'Skills', value: mergedSkills.length },
    ],
    artifacts: [{ path: artifact.relativePath, note: snapshotDate }],
  };
}
