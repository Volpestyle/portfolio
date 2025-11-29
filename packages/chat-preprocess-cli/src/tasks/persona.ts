import { promises as fs } from 'node:fs';
import OpenAI from 'openai';
import type { PersonaSummary, ProfileSummary } from '@portfolio/chat-contract';
import { requireEnv } from '../env';
import type { PreprocessMetrics } from '../metrics';
import type { PreprocessContext, PreprocessTaskResult } from '../types';
import { normalizeDistinctStrings } from '../utils';
import type {
  NormalizedAward,
  NormalizedEducation,
  NormalizedExperience,
  NormalizedSkill,
} from './resume';

type ResumeDataset = {
  experiences: NormalizedExperience[];
  education?: NormalizedEducation[];
  awards?: NormalizedAward[];
  skills?: NormalizedSkill[];
};

type PersonaArtifact = {
  generatedAt: string;
} & PersonaSummary;

const SYSTEM_PROMPT = `
You craft concise persona blurbs for a software engineer's portfolio assistant.

OUTPUT FIELDS
- systemPersona: 2-4 sentences describing who they are, the kind of work they do, and their tone.
- shortAbout: 2-4 sentences of friendly first-person bio.
- styleGuidelines: 4-6 short bullet phrases (imperative voice) describing tone, pacing, and specificity.

RULES
- Base everything ONLY on the provided profile + resume snapshot.
- Highlight specialties (frameworks, platforms, domains) and any leadership/impact patterns.
- Keep the voice casual but confident; avoid buzzword soup.
- Return strict JSON matching the requested fields. No markdown or commentary.
`.trim();

async function loadJson<T>(filePath: string): Promise<T> {
  const contents = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(contents) as T;
}

function buildResumeSnapshot(resume: ResumeDataset) {
  const experiences = (resume.experiences ?? [])
    .slice(0, 6)
    .map((exp) => ({
      company: exp.company,
      title: exp.title,
      experienceType: exp.experienceType,
      impactSummary: exp.impactSummary ?? exp.summary ?? '',
      topSkills: (exp.skills ?? []).slice(0, 5),
    }));

  const education = (resume.education ?? []).map((edu) => ({
    institution: edu.institution,
    degree: edu.degree,
    field: edu.field,
  }));

  const aggregateSkills = normalizeDistinctStrings([
    ...((resume.skills ?? []).map((skill) => skill.name) ?? []),
    ...resume.experiences.flatMap((exp) => exp.skills ?? []),
  ]).slice(0, 12);

  return { experiences, education: education.slice(0, 3), topSkills: aggregateSkills };
}

function coercePersona(value: Partial<PersonaSummary>, fallback: PersonaSummary): PersonaSummary {
  const normalizedGuidelines = normalizeDistinctStrings(value.styleGuidelines ?? fallback.styleGuidelines).filter(Boolean);
  return {
    systemPersona: value.systemPersona?.trim() || fallback.systemPersona,
    shortAbout: value.shortAbout?.trim() || fallback.shortAbout,
    styleGuidelines: normalizedGuidelines.length ? normalizedGuidelines : fallback.styleGuidelines,
  };
}

function buildFallbackPersona(profile: ProfileSummary): PersonaSummary {
  const firstAbout = profile.about?.[0]?.trim() ?? profile.headline;
  return {
    systemPersona: `You are ${profile.fullName}, ${profile.headline}. Speak in first-person, grounded in your portfolio projects and resume.`,
    shortAbout:
      firstAbout ||
      `I'm ${profile.fullName}, ${profile.headline}. I love shipping polished front-ends and dependable services with modern TypeScript stacks.`,
    styleGuidelines: [
      'Sound like a real person—warm, direct, and a little nerdy.',
      'Ground every claim in concrete projects or roles.',
      'Prefer crisp sentences with specific stacks and outcomes.',
      'Admit when the portfolio lacks data instead of speculating.',
    ],
  };
}

async function generatePersonaSummary(params: {
  client: OpenAI;
  model: string;
  profile: ProfileSummary;
  resume: ResumeDataset;
  metrics?: PreprocessMetrics;
}): Promise<PersonaSummary> {
  const { client, model, profile, resume, metrics } = params;
  const fallback = buildFallbackPersona(profile);
  const resumeSnapshot = buildResumeSnapshot(resume);
  const conversation = [
    `Profile:\n${JSON.stringify(profile, null, 2)}`,
    '',
    `Resume snapshot:\n${JSON.stringify(resumeSnapshot, null, 2)}`,
  ].join('\n');

  try {
    const completion = await (metrics
      ? metrics.wrapLlm(
          { stage: 'persona_generation', model, meta: { profile: profile.fullName } },
          () =>
            client.chat.completions.create({
              model,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: conversation },
              ],
            })
        )
      : client.chat.completions.create({
          model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: conversation },
          ],
        }));
    const raw = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as Partial<PersonaSummary>;
    return coercePersona(parsed, fallback);
  } catch (error) {
    console.warn('[persona] Failed to generate via model. Falling back to heuristic persona.', error);
    return fallback;
  }
}

export async function runPersonaTask(context: PreprocessContext): Promise<PreprocessTaskResult> {
  const openAiKey = requireEnv('OPENAI_API_KEY');
  const client = new OpenAI({ apiKey: openAiKey });
  const model = context.models.projectTextModel;
  const profilePath = context.paths.profileOutput;
  const resumePath = context.paths.experiencesOutput;
  const personaPath = context.paths.personaOutput;

  const profile = await loadJson<ProfileSummary>(profilePath);
  const resume = await loadJson<ResumeDataset>(resumePath);

  const persona = await generatePersonaSummary({ client, model, profile, resume, metrics: context.metrics });
  const artifactPayload: PersonaArtifact = {
    generatedAt: new Date().toISOString(),
    ...persona,
  };
  const artifact = await context.artifacts.writeJson({
    id: 'persona',
    filePath: personaPath,
    data: artifactPayload,
  });

  return {
    description: 'Generated persona summary',
    counts: [{ label: 'Style guidelines', value: artifactPayload.styleGuidelines.length }],
    artifacts: [{ path: artifact.relativePath, note: artifactPayload.systemPersona.slice(0, 64) }],
  };
}
