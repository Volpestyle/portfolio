import path from 'node:path';
import { promises as fs } from 'node:fs';
import OpenAI from 'openai';
import { PreprocessError, PREPROCESS_ERROR_CODES } from '../errors';
import { requireEnv } from '../env';
import type { PreprocessContext, PreprocessTaskResult } from '../types';
import type { NormalizedAward, NormalizedEducation, NormalizedExperience, NormalizedSkill } from './resume';

type ResumeDataset = {
  experiences: NormalizedExperience[];
  education?: NormalizedEducation[];
  awards?: NormalizedAward[];
  skills?: NormalizedSkill[];
};

function formatTimeframe(start?: string, end?: string | null): string {
  if (!start) return end ?? 'present';
  const safeEnd = end ?? 'present';
  return `${start} → ${safeEnd}`;
}

function buildExperienceEmbeddingInput(experience: NormalizedExperience): string {
  const parts = [
    `${experience.company} — ${experience.title}`,
    experience.location ? `Location: ${experience.location}` : '',
    `Timeframe: ${formatTimeframe(experience.startDate, experience.endDate)}`,
    experience.summary ?? '',
    experience.bullets.length ? `Highlights: ${experience.bullets.join(' • ')}` : '',
    experience.skills.length ? `Skills: ${experience.skills.join(', ')}` : '',
  ];
  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join('\n');
}

function buildEducationEmbeddingInput(edu: NormalizedEducation): string {
  const parts = [
    `${edu.institution} — ${[edu.degree, edu.field].filter(Boolean).join(' ')}`.trim(),
    edu.location ? `Location: ${edu.location}` : '',
    edu.startDate || edu.endDate ? `Timeframe: ${formatTimeframe(edu.startDate, edu.endDate)}` : '',
    edu.summary ?? '',
    (edu.bullets ?? []).length ? `Highlights: ${(edu.bullets ?? []).join(' • ')}` : '',
    (edu.skills ?? []).length ? `Skills: ${(edu.skills ?? []).join(', ')}` : '',
  ];
  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join('\n');
}

function buildAwardEmbeddingInput(award: NormalizedAward): string {
  const parts = [
    `${award.title}${award.issuer ? ` — ${award.issuer}` : ''}`,
    award.date ? `Date: ${award.date}` : '',
    award.summary ?? '',
    (award.bullets ?? []).length ? `Highlights: ${(award.bullets ?? []).join(' • ')}` : '',
    (award.skills ?? []).length ? `Skills: ${(award.skills ?? []).join(', ')}` : '',
  ];
  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join('\n');
}

function buildSkillEmbeddingInput(skill: NormalizedSkill): string {
  const parts = [
    skill.name,
    skill.category ? `Category: ${skill.category}` : '',
    skill.summary ?? '',
    (skill.skills ?? []).length ? `Related: ${(skill.skills ?? []).join(', ')}` : '',
  ];
  return parts
    .map((part) => (part ?? '').trim())
    .filter((part) => part.length > 0)
    .join('\n');
}

async function loadResume(filePath: string): Promise<ResumeDataset> {
  const raw = await fs.readFile(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as ResumeDataset;
  if (!Array.isArray(parsed.experiences)) {
    throw new PreprocessError(
      PREPROCESS_ERROR_CODES.RESUME_SOURCE_INVALID,
      'Resume dataset must include an experiences array'
    );
  }
  return { experiences: parsed.experiences, education: parsed.education ?? [], awards: parsed.awards ?? [], skills: parsed.skills ?? [] };
}

function relPath(context: PreprocessContext, filePath: string): string {
  return path.relative(context.paths.rootDir, filePath);
}

export async function runExperienceEmbeddingsTask(context: PreprocessContext): Promise<PreprocessTaskResult> {
  const openAiKey = requireEnv('OPENAI_API_KEY');
  const datasetPath = context.paths.experiencesOutput;
  const outputPath = context.paths.resumeEmbeddingsOutput;
  const client = new OpenAI({ apiKey: openAiKey });
  const { resumeEmbeddingModel } = context.models;

  const exists = await fs
    .access(datasetPath)
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    throw new PreprocessError(
      PREPROCESS_ERROR_CODES.NO_RESUME,
      `Experience dataset not found at ${relPath(context, datasetPath)}`
    );
  }

  const dataset = await loadResume(datasetPath);
  const allEntries = [
    ...dataset.experiences,
    ...(dataset.education ?? []),
    ...(dataset.awards ?? []),
    ...(dataset.skills ?? []),
  ];

  if (!allEntries.length) {
    const buildId = new Date().toISOString();
    const emptyIndex = {
      meta: {
        schemaVersion: 1,
        buildId,
      },
      entries: [] as Array<{ id: string; vector: number[] }>,
    };
    const artifact = await context.artifacts.writeJson({
      id: 'resume-embeddings',
      filePath: outputPath,
      data: emptyIndex,
    });
    return {
      description: 'No experiences found. Wrote empty embeddings file.',
      counts: [{ label: 'Embeddings', value: 0 }],
      artifacts: [{ path: artifact.relativePath, note: '0 vectors' }],
    };
  }

  const embeddings: Array<{ id: string; vector: number[] }> = [];
  const payloads = allEntries.map((entry) => {
    const entryType = (entry as { type?: string }).type;
    if (entryType === 'skill') {
      return { id: entry.id, payload: buildSkillEmbeddingInput(entry as NormalizedSkill) };
    }
    if (entryType === 'education') {
      return { id: entry.id, payload: buildEducationEmbeddingInput(entry as NormalizedEducation) };
    }
    if (entryType === 'award') {
      return { id: entry.id, payload: buildAwardEmbeddingInput(entry as NormalizedAward) };
    }
    if ('company' in entry) {
      return { id: entry.id, payload: buildExperienceEmbeddingInput(entry as NormalizedExperience) };
    }
    if ('institution' in entry) {
      return { id: entry.id, payload: buildEducationEmbeddingInput(entry as NormalizedEducation) };
    }
    if ('issuer' in entry) {
      return { id: entry.id, payload: buildAwardEmbeddingInput(entry as NormalizedAward) };
    }
    return { id: entry.id, payload: buildSkillEmbeddingInput(entry as NormalizedSkill) };
  });

  const BATCH_SIZE = 32;
  for (let idx = 0; idx < payloads.length; idx += BATCH_SIZE) {
    const batch = payloads.slice(idx, idx + BATCH_SIZE);
    const response = await context.metrics.wrapLlm(
      { stage: 'other', model: resumeEmbeddingModel, meta: { batchSize: batch.length } },
      () =>
        client.embeddings.create({
          model: resumeEmbeddingModel,
          input: batch.map((item) => item.payload),
        })
    );
    response.data.forEach((row, rowIdx) => {
      const record = batch[rowIdx];
      embeddings.push({
        id: record?.id ?? `entry-${idx + rowIdx}`,
        vector: row?.embedding ?? [],
      });
    });
  }

  const buildId = new Date().toISOString();
  const embeddingIndex = {
    meta: {
      schemaVersion: 1,
      buildId,
    },
    entries: embeddings,
  };

  const artifact = await context.artifacts.writeJson({
    id: 'resume-embeddings',
    filePath: outputPath,
    data: embeddingIndex,
  });

  return {
    description: `Generated ${embeddings.length} resume embeddings`,
    counts: [
      { label: 'Experiences', value: dataset.experiences.length },
      { label: 'Education', value: dataset.education?.length ?? 0 },
      { label: 'Awards', value: dataset.awards?.length ?? 0 },
      { label: 'Skills', value: dataset.skills?.length ?? 0 },
      { label: 'Embeddings', value: embeddings.length },
    ],
    artifacts: [{ path: artifact.relativePath, note: `${embeddings.length} vectors` }],
  };
}
