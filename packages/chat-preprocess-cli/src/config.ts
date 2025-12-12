import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import YAML from 'yaml';
import type {
  ArtifactWriterConfig,
  ChatPreprocessConfig,
  PreprocessPathOverrides,
  PreprocessPaths,
  PreprocessModelConfig,
  ResolvedModelConfig,
  RepoMatcher,
  ResolvedPreprocessConfig,
  ResolvedRepoSelection,
} from './types';
import { DEFAULT_ENV_FILES } from './env';

const DEFAULT_TEXT_MODEL = 'gpt-5-nano-2025-08-07';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-large';
const DEFAULT_RESUME_FILENAME = 'resume.pdf';
const DEFAULT_SKILL_CONTAINER_PATTERNS: RegExp[] = [
  /^(languages(\s*&\s*frameworks)?|frameworks)$/i,
  /^(platforms?|cloud\s*platforms?)$/i,
  /^(tools?|tooling)$/i,
  /^(tech(nologies)?|tech\s*stack|technology\s*stack)$/i,
  /^(databases?|data\s*apis|databases\s*&\s*data\s*apis)$/i,
  /^(skills|technical\s*skills|skills\s*summary)$/i,
  /^(core\s*competencies|competencies|areas\s*of\s*expertise|expertise)$/i,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeProvider(value: unknown): 'openai' | 'anthropic' | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'openai') return 'openai';
  if (normalized === 'anthropic' || normalized === 'claude') return 'anthropic';
  return undefined;
}

function toArray<T>(value: T | T[] | undefined): T[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) ? value : [value];
}

function normalizeRepoSpec(value: string): RepoMatcher | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const [maybeOwner, maybeRepo] = trimmed.split('/');
  if (maybeRepo) {
    return {
      owner: maybeOwner?.trim()?.toLowerCase() || undefined,
      name: maybeRepo.trim().toLowerCase(),
    };
  }
  return { name: maybeOwner.trim().toLowerCase() };
}

function normalizeMatchers(values?: string[]): RepoMatcher[] {
  if (!values?.length) {
    return [];
  }
  const result: RepoMatcher[] = [];
  for (const value of values) {
    const matcher = normalizeRepoSpec(value);
    if (matcher) {
      result.push(matcher);
    }
  }
  return result;
}

const toRegex = (value: unknown): RegExp | null => {
  if (value instanceof RegExp) {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const regexLike = /^\/(.+)\/([a-z]*)$/i.exec(trimmed);
  if (regexLike) {
    const [, source, flagsRaw] = regexLike;
    const flags = flagsRaw?.includes('i') ? flagsRaw : `${flagsRaw ?? ''}i`;
    try {
      return new RegExp(source, flags);
    } catch {
      return null;
    }
  }

  try {
    return new RegExp(trimmed, 'i');
  } catch {
    return null;
  }
};

const normalizeRegexList = (value?: Array<string | RegExp> | string | RegExp): RegExp[] => {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  const patterns: RegExp[] = [];
  for (const item of list) {
    const regex = toRegex(item);
    if (regex) {
      patterns.push(regex);
    }
  }
  return patterns;
};

export function mergeConfigs(configs: Array<ChatPreprocessConfig | undefined>): ChatPreprocessConfig {
  const merged: ChatPreprocessConfig = {};

  for (const current of configs) {
    if (!current) continue;
    if (current.provider) {
      merged.provider = current.provider;
    }
    if (current.envFiles) {
      merged.envFiles = current.envFiles;
    }
    if (current.paths) {
      merged.paths = { ...(merged.paths ?? {}), ...current.paths };
    }
    if (current.repos) {
      merged.repos = { ...(merged.repos ?? {}), ...current.repos };
    }
    if (current.artifacts) {
      merged.artifacts = { ...(merged.artifacts ?? {}), ...current.artifacts };
    }
    if (current.models) {
      merged.models = { ...(merged.models ?? {}), ...current.models };
    }
    if (current.resume) {
      merged.resume = { ...(merged.resume ?? {}), ...current.resume };
    }
  }

  return merged;
}

function pickModel(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function resolveModelConfig(config?: PreprocessModelConfig): ResolvedModelConfig {
  const baseTextModel = pickModel(config?.textModel, DEFAULT_TEXT_MODEL);
  const projectTextModel = pickModel(config?.projectTextModel, baseTextModel);
  const resumeTextModel = pickModel(config?.resumeTextModel, baseTextModel);

  const baseEmbeddingModel = pickModel(config?.embeddingModel, DEFAULT_EMBEDDING_MODEL);
  const projectEmbeddingModel = pickModel(config?.projectEmbeddingModel, baseEmbeddingModel);
  const resumeEmbeddingModel = pickModel(config?.resumeEmbeddingModel, baseEmbeddingModel);

  return {
    projectTextModel,
    resumeTextModel,
    projectEmbeddingModel,
    resumeEmbeddingModel,
    embeddingModel: baseEmbeddingModel,
  };
}

export function resolvePreprocessConfig(config?: ChatPreprocessConfig): ResolvedPreprocessConfig {
  const rootDir = path.resolve(config?.paths?.rootDir ?? process.cwd());
  const dataDir = path.resolve(rootDir, config?.paths?.dataDir ?? 'data/chat');
  const generatedDir = path.resolve(rootDir, config?.paths?.generatedDir ?? 'generated');
  const resumeFilename = config?.resume?.filename?.trim() || DEFAULT_RESUME_FILENAME;
  const skillContainerPatterns =
    normalizeRegexList(config?.resume?.skillContainerPatterns) ?? [];
  const resolvedSkillContainers =
    skillContainerPatterns.length > 0 ? skillContainerPatterns : DEFAULT_SKILL_CONTAINER_PATTERNS;

  function resolveOverride(key: keyof PreprocessPathOverrides, defaultPath: string): string {
    const override = config?.paths?.[key];
    if (!override) {
      return defaultPath;
    }
    return path.isAbsolute(override) ? override : path.resolve(rootDir, override);
  }

  const paths: PreprocessPaths = {
    rootDir,
    dataDir,
    generatedDir,
    resumePdf: resolveOverride('resumePdf', path.resolve(rootDir, 'public/resume', resumeFilename)),
    resumeJson: resolveOverride('resumeJson', path.join(generatedDir, 'resume-raw.json')),
    profileSource: resolveOverride('profileSource', path.join(dataDir, 'profile.json')),
    experiencesOutput: resolveOverride('experiencesOutput', path.join(generatedDir, 'resume.json')),
    profileOutput: resolveOverride('profileOutput', path.join(generatedDir, 'profile.json')),
    projectsOutput: resolveOverride('projectsOutput', path.join(generatedDir, 'projects.json')),
    projectsEmbeddingsOutput: resolveOverride(
      'projectsEmbeddingsOutput',
      path.join(generatedDir, 'projects-embeddings.json')
    ),
    resumeEmbeddingsOutput: resolveOverride(
      'resumeEmbeddingsOutput',
      path.join(generatedDir, 'resume-embeddings.json')
    ),
    personaOutput: resolveOverride('personaOutput', path.join(generatedDir, 'persona.json')),
  };

  const repoSelection: ResolvedRepoSelection = {
    gistId: config?.repos?.gistId,
    include: normalizeMatchers(config?.repos?.include),
    exclude: normalizeMatchers(config?.repos?.exclude),
  };

  const writerConfigs: ArtifactWriterConfig[] = config?.artifacts?.writers ?? [];

  return {
    provider: normalizeProvider(config?.provider) ?? 'openai',
    envFiles: config?.envFiles?.length ? config.envFiles : DEFAULT_ENV_FILES,
    paths,
    repos: repoSelection,
    artifacts: { writerConfigs },
    models: resolveModelConfig(config?.models),
    resume: { filename: resumeFilename, skillContainerPatterns: resolvedSkillContainers },
  };
}

export async function loadConfigFile(configPath: string): Promise<ChatPreprocessConfig> {
  const absolute = path.resolve(process.cwd(), configPath);
  const ext = path.extname(absolute).toLowerCase();

  if (ext === '.json') {
    const contents = await fs.readFile(absolute, 'utf-8');
    return JSON.parse(contents) as ChatPreprocessConfig;
  }

  if (ext === '.yml' || ext === '.yaml') {
    const contents = await fs.readFile(absolute, 'utf-8');
    return YAML.parse(contents) as ChatPreprocessConfig;
  }

  if (ext === '.js' || ext === '.cjs' || ext === '.mjs') {
    const imported = await import(pathToFileURL(absolute).href);
    const value = imported.default ?? imported.config ?? imported;
    if (!isRecord(value)) {
      throw new Error(`Configuration at ${configPath} must export an object`);
    }
    return value as ChatPreprocessConfig;
  }

  throw new Error(`Unsupported config format for ${configPath}. Use .json, .yaml, or .js`);
}

export function coerceEnvFileList(
  cliValues?: string[] | string,
  configValues?: string[] | string
): string[] | undefined {
  const list = toArray(cliValues) ?? toArray(configValues);
  return list?.length ? list : undefined;
}
