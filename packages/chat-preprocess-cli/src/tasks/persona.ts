import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PersonaSummary, ProfileSummary } from '@portfolio/chat-contract';
import type { PreprocessContext, PreprocessTaskResult } from '../types';
import { normalizeDistinctStrings } from '../utils';

type PersonaArtifact = {
  generatedAt: string;
} & PersonaSummary;

async function loadJson<T>(filePath: string): Promise<T> {
  const contents = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(contents) as T;
}

function coercePersona(value: Partial<PersonaSummary>, fallback: PersonaSummary): PersonaSummary {
  const normalizedGuidelines = normalizeDistinctStrings(value.styleGuidelines ?? fallback.styleGuidelines).filter(Boolean);
  const normalizedVoiceExamples = normalizeDistinctStrings(value.voiceExamples ?? fallback.voiceExamples).filter(Boolean);
  return {
    systemPersona: value.systemPersona?.trim() || fallback.systemPersona,
    shortAbout: value.shortAbout?.trim() || fallback.shortAbout,
    styleGuidelines: normalizedGuidelines.length ? normalizedGuidelines : fallback.styleGuidelines,
    voiceExamples: normalizedVoiceExamples.length ? normalizedVoiceExamples : fallback.voiceExamples,
  };
}

function buildPersonaFromProfile(profile: ProfileSummary): PersonaSummary {
  const headline = profile.headline ? `, ${profile.headline}` : '';
  const location = profile.location ? ` in ${profile.location}` : '';
  const role = profile.currentRole ? ` (${profile.currentRole})` : '';
  const topSkills = normalizeDistinctStrings(profile.topSkills).slice(0, 5);
  const skillClause = topSkills.length ? ` Common tools: ${topSkills.join(', ')}.` : '';
  const systemPersona =
    profile.systemPersona?.trim() ||
    `You are ${profile.fullName}${headline}${role}${location}. Speak in first-person, grounded in real projects and experience.${skillClause}`;

  const aboutString =
    typeof profile.about === 'string' ? profile.about : profile.about?.find((p) => p?.trim())?.trim() ?? '';
  const shortAbout =
    profile.shortAbout?.trim() ||
    (aboutString
      ? aboutString
      : `I'm ${profile.fullName}, ${profile.headline}. I ship polished products with modern JavaScript and cloud tooling.`);

  const styleGuidelines = normalizeDistinctStrings(profile.styleGuidelines);
  const fallbackGuidelines = [
    'Keep the tone warm, direct, and confident.',
    'Favor concrete technologies and shipped outcomes over buzzwords.',
    'Ground claims in real work (projects, roles, launches).',
    'Stay concise; prefer crisp sentences.',
    'Acknowledge limits instead of speculating.',
  ];

  const voiceExamples = normalizeDistinctStrings(profile.voiceExamples);
  const fallbackVoiceExamples = [
    "Hey, I'm James—a Chicago-based full-stack engineer shipping web and mobile apps.",
    'Most days I’m in React, Next.js, and TypeScript, wiring features end to end.',
    'I like shipping quickly, getting feedback, and tightening the UX with each release.',
    "Ask me about the AWS IAM Console or the Lowe's returns app we shipped at scale.",
  ];

  return {
    systemPersona,
    shortAbout,
    styleGuidelines: styleGuidelines.length ? styleGuidelines : fallbackGuidelines,
    voiceExamples: voiceExamples.length ? voiceExamples : fallbackVoiceExamples,
  };
}

async function readOptionalJson<T>(filePath: string): Promise<T | null> {
  try {
    const contents = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(contents) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function runPersonaTask(context: PreprocessContext): Promise<PreprocessTaskResult> {
  const profilePath = context.paths.profileOutput;
  const personaPath = context.paths.personaOutput;
  const overridePath = path.join(context.paths.dataDir, 'persona.override.json');

  const profile = await loadJson<ProfileSummary>(profilePath);
  const profileVoiceExamples = normalizeDistinctStrings(profile.voiceExamples);
  const override = await readOptionalJson<Partial<PersonaSummary>>(overridePath);

  const persona = buildPersonaFromProfile(profile);
  const personaOverrides: Partial<PersonaSummary> = { ...(override ?? {}) };
  if (profileVoiceExamples.length) {
    personaOverrides.voiceExamples = profileVoiceExamples;
  }
  const mergedPersona = coercePersona({ ...persona, ...personaOverrides }, persona);
  const artifactPayload: PersonaArtifact = {
    generatedAt: new Date().toISOString(),
    ...mergedPersona,
  };
  const artifact = await context.artifacts.writeJson({
    id: 'persona',
    filePath: personaPath,
    data: artifactPayload,
  });

  return {
    description: 'Generated persona summary',
    counts: [
      { label: 'Style guidelines', value: artifactPayload.styleGuidelines.length },
      { label: 'Voice examples', value: artifactPayload.voiceExamples?.length ?? 0 },
    ],
    artifacts: [{ path: artifact.relativePath, note: artifactPayload.systemPersona.slice(0, 64) }],
  };
}
