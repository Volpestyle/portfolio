import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client } from '@/server/blog/clients';
import type { PortfolioConfig, PortfolioRepoConfig } from '@/types/portfolio';
import { assertNoFixtureFlagsInProd, shouldUseFixtureRuntime } from '@/lib/test-flags';

const DEFAULT_CONFIG_KEY = 'portfolio/config.json';

function resolveLocation(): { bucket: string; key: string } {
  const bucket = process.env.PORTFOLIO_CONFIG_BUCKET || process.env.CONTENT_BUCKET;
  const key = process.env.PORTFOLIO_CONFIG_KEY || DEFAULT_CONFIG_KEY;

  assertNoFixtureFlagsInProd();

  if (!bucket) {
    throw new Error('Portfolio config bucket is not configured. Set PORTFOLIO_CONFIG_BUCKET or CONTENT_BUCKET.');
  }

  return { bucket, key };
}

function normalizeConfig(input: PortfolioConfig | null | undefined): PortfolioConfig | null {
  if (!input || !Array.isArray(input.repositories)) {
    return null;
  }

  const repositories: PortfolioRepoConfig[] = [];
  for (const repo of input.repositories) {
    const name = typeof repo.name === 'string' ? repo.name.trim() : '';
    if (!name) continue;

    repositories.push({
      name,
      publicRepo: repo.publicRepo?.trim() || undefined,
      isStarred: Boolean(repo.isStarred),
      isPrivate: Boolean(repo.isPrivate),
      owner: repo.owner?.trim() || undefined,
      description: repo.description?.trim() || undefined,
      readme: repo.readme,
      readmeGistId: repo.readmeGistId,
      documents: Array.isArray(repo.documents) ? repo.documents : undefined,
      techStack: Array.isArray(repo.techStack) ? repo.techStack : undefined,
      demoUrl: repo.demoUrl?.trim() || undefined,
      screenshots: Array.isArray(repo.screenshots) ? repo.screenshots : undefined,
      topics: Array.isArray(repo.topics) ? repo.topics : undefined,
      language: repo.language?.trim() || undefined,
      languages: repo.languages,
      createdAt: repo.createdAt,
      updatedAt: repo.updatedAt,
      homepage: repo.homepage?.trim() || undefined,
      icon: repo.icon?.trim() || undefined,
    });
  }

  return { repositories };
}

async function readObjectFromS3(): Promise<string | null> {
  const { bucket, key } = resolveLocation();
  const s3 = getS3Client();

  try {
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );

    const body = await response.Body?.transformToString();
    return body ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as { name?: string; Code?: string })?.name ?? (error as { Code?: string }).Code;
    const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    const isMissing =
      message?.toLowerCase().includes('nosuchkey') ||
      code?.toLowerCase?.() === 'nosuchkey' ||
      status === 404;

    if (isMissing) {
      console.warn(`[portfolio-config] No config found at ${bucket}/${key}; falling back to gist or defaults if available`);
      return null;
    }

    console.error('[portfolio-config] Failed to read config from S3', error);
    throw error;
  }
}

async function writeObjectToS3(body: string): Promise<void> {
  const { bucket, key } = resolveLocation();
  const s3 = getS3Client();

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'application/json',
    })
  );
}

function buildFixtureConfig(): PortfolioConfig {
  return {
    repositories: [
      {
        name: 'sample-ai-app',
        isStarred: true,
        icon: 'rocket',
      },
    ],
  };
}

export async function loadPortfolioConfig(): Promise<PortfolioConfig | null> {
  if (shouldUseFixtureRuntime()) {
    return buildFixtureConfig();
  }

  const raw = await readObjectFromS3();
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as PortfolioConfig;
    return normalizeConfig(parsed);
  } catch (error) {
    console.error('[portfolio-config] Failed to parse stored config', error);
    return null;
  }
}

export async function savePortfolioConfig(config: PortfolioConfig): Promise<PortfolioConfig> {
  const normalized = normalizeConfig(config);
  if (!normalized) {
    throw new Error('Portfolio config must include a repositories array.');
  }

  const payload = JSON.stringify({ ...normalized, updatedAt: new Date().toISOString() });
  await writeObjectToS3(payload);
  return normalized;
}
