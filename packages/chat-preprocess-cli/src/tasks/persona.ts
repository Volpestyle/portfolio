import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PersonaProfile, PersonaSummary, ProfileSummary } from '@portfolio/chat-contract';
import type { PreprocessContext, PreprocessTaskResult } from '../types';
import { normalizeDistinctStrings } from '../utils';

type PersonaArtifact = {
  generatedAt: string;
} & PersonaSummary;

type SocialLinkInput = {
  url?: string | null;
  blurb?: string | null;
};

async function loadJson<T>(filePath: string): Promise<T> {
  const contents = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(contents) as T;
}

function normalizePersonaLinks(
  links?: Array<string | SocialLinkInput | (PersonaProfile['socialLinks'] extends Array<infer T> ? T : never)>
): PersonaProfile['socialLinks'] | undefined {
  if (!links?.length) {
    return undefined;
  }
  const dedup = new Map<string, { url: string; blurb?: string }>();
  for (const link of links) {
    const url =
      typeof link === 'string'
        ? link
        : (link as SocialLinkInput)?.url ?? (link as { url?: string })?.url;
    const blurb =
      typeof link === 'string'
        ? undefined
        : (link as SocialLinkInput)?.blurb ?? (link as { blurb?: string })?.blurb;
    const trimmedUrl = url?.trim();
    if (!trimmedUrl) continue;
    const trimmedBlurb = blurb?.trim();
    const existing = dedup.get(trimmedUrl);
    if (existing) {
      if (!existing.blurb && trimmedBlurb) {
        existing.blurb = trimmedBlurb;
      }
      continue;
    }
    dedup.set(trimmedUrl, trimmedBlurb ? { url: trimmedUrl, blurb: trimmedBlurb } : { url: trimmedUrl });
  }
  if (!dedup.size) return undefined;
  return Array.from(dedup.values());
}

function mergePersonaProfile(value?: PersonaProfile, fallback?: PersonaProfile): PersonaProfile | undefined {
  if (!value && !fallback) return undefined;
  const merged: PersonaProfile = {
    ...(fallback ?? {}),
    ...(value ?? {}),
  };
  // Persona snapshot intentionally omits long-form about paragraphs.
  delete (merged as { about?: unknown }).about;
  if (merged.topSkills) {
    merged.topSkills = normalizeDistinctStrings(merged.topSkills);
  }
  merged.socialLinks = normalizePersonaLinks([
    ...(fallback?.socialLinks ?? []),
    ...(value?.socialLinks ?? []),
  ]);
  if (merged.featuredExperienceIds) {
    merged.featuredExperienceIds = normalizeDistinctStrings(merged.featuredExperienceIds);
  }
  return merged;
}

function coercePersona(value: Partial<PersonaSummary>, fallback: PersonaSummary): PersonaSummary {
  const normalizedGuidelines = normalizeDistinctStrings(value.styleGuidelines ?? fallback.styleGuidelines).filter(
    Boolean
  );
  const normalizedVoiceExamples = normalizeDistinctStrings(value.voiceExamples ?? fallback.voiceExamples).filter(
    Boolean
  );
  return {
    systemPersona: value.systemPersona?.trim() || fallback.systemPersona,
    shortAbout: value.shortAbout?.trim() || fallback.shortAbout,
    styleGuidelines: normalizedGuidelines.length ? normalizedGuidelines : fallback.styleGuidelines,
    voiceExamples: normalizedVoiceExamples.length ? normalizedVoiceExamples : fallback.voiceExamples,
    profile: mergePersonaProfile(value.profile, fallback.profile),
  };
}

function extractAboutParagraphs(about: ProfileSummary['about']): string[] {
  const paragraphs = Array.isArray(about) ? about : typeof about === 'string' ? about.split(/\n\s*\n/) : [];
  return paragraphs.map((paragraph) => paragraph.trim()).filter(Boolean);
}

function buildPersonaFromProfile(profile: ProfileSummary): PersonaSummary {
  const headline = profile.headline ? `, ${profile.headline}` : '';
  const location = profile.currentLocation ? ` in ${profile.currentLocation}` : '';
  const role = profile.currentRole ? ` (${profile.currentRole})` : '';
  const topSkills = normalizeDistinctStrings(profile.topSkills);
  const skillClause = topSkills.length ? ` Common tools: ${topSkills.join(', ')}.` : '';
  const systemPersona =
    profile.systemPersona?.trim() ||
    `You are ${profile.fullName}${headline}${role}${location}. Speak in first-person, grounded in real projects and experience.${skillClause}`;

  const aboutParagraphs = extractAboutParagraphs(profile.about);
  const shortAboutFromProfile = aboutParagraphs.slice(0, 3).join(' ').trim();
  const shortAbout =
    shortAboutFromProfile ||
    `I'm ${profile.fullName}, ${profile.headline}. I ship polished products with modern JavaScript and cloud tooling.`;

  const styleGuidelines = normalizeDistinctStrings(profile.styleGuidelines);

  const voiceExamples = normalizeDistinctStrings(profile.voiceExamples);

  return {
    systemPersona,
    shortAbout,
    styleGuidelines,
    voiceExamples,
    profile: {
      updatedAt: profile.updatedAt,
      fullName: profile.fullName,
      headline: profile.headline,
      currentLocation: profile.currentLocation,
      currentRole: profile.currentRole,
      topSkills,
      socialLinks: normalizePersonaLinks(
        (profile.socialLinks ?? []).map((link) => ({ url: link?.url, blurb: link?.blurb }))
      ),
      featuredExperienceIds: normalizeDistinctStrings(
        (profile.featuredExperiences ?? []).map((exp) => exp?.id?.trim()).filter((id): id is string => Boolean(id))
      ),
    },
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
