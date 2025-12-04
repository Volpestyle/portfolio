import { execSync } from 'child_process';

export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

export const log = {
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  info: (msg: string) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  section: (msg: string) => console.log(`\n${colors.cyan}${colors.bright}${msg}${colors.reset}`),
  detail: (msg: string) => console.log(`  ${colors.dim}${msg}${colors.reset}`),
};

export function firstNonEmpty(...values: Array<string | undefined | null>): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return undefined;
}

export function sanitizeRepoName(name: string): string {
  return name.endsWith('.git') ? name.slice(0, -4) : name;
}

export function parseOwnerRepoFromUrl(url: string): { owner?: string; repo?: string } {
  try {
    if (url.startsWith('git@')) {
      const match = url.match(/^git@[^:]+:([^/]+)\/(.+)$/);
      if (match) {
        const owner = match[1];
        const repo = sanitizeRepoName(match[2]);
        return { owner, repo };
      }
    }

    const parsed = new URL(url.replace(/^ssh:\/\//, 'https://'));
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length >= 2) {
      const owner = segments[0] ?? '';
      const repo = sanitizeRepoName(segments[1] ?? '');
      if (owner && repo) {
        return { owner, repo };
      }
    }
  } catch {
    // ignore
  }
  return {};
}

export function detectOwnerRepoFromEnv(): { owner?: string; repo?: string } {
  const composite = process.env.GH_REPOSITORY; // e.g. owner/repo
  if (composite && composite.includes('/')) {
    const [owner, rawRepo] = composite.split('/', 2);
    const repo = sanitizeRepoName(rawRepo);
    if (owner && repo) {
      return { owner, repo };
    }
  }
  return {};
}

export function detectOwnerRepoFromGit(): { owner?: string; repo?: string } {
  try {
    const output = execSync('git remote get-url origin', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    if (output) {
      return parseOwnerRepoFromUrl(output);
    }
  } catch {
    // ignore
  }
  return {};
}

export type ParsedBuckets = {
  envVars: Record<string, string>;
  envSecrets: Record<string, string>;
  repoVars: Record<string, string>;
  repoSecrets: Record<string, string>;
};

export function resolveOwnerRepoFromParsed(parsed: ParsedBuckets): { owner?: string; repo?: string } {
  const owner = firstNonEmpty(
    parsed.repoVars.GH_OWNER,
    parsed.envVars.GH_OWNER,
    parsed.repoSecrets.GH_OWNER,
    parsed.envSecrets.GH_OWNER
  );
  const repo = firstNonEmpty(
    parsed.repoVars.GH_REPO,
    parsed.envVars.GH_REPO,
    parsed.repoSecrets.GH_REPO,
    parsed.envSecrets.GH_REPO
  );
  return { owner: owner?.trim() || undefined, repo: repo?.trim() || undefined };
}

export function resolveOwnerRepo(parsed?: ParsedBuckets): { owner?: string; repo?: string } {
  // 1) GH_REPOSITORY override from process.env
  const fromEnvOverride = detectOwnerRepoFromEnv();
  if (fromEnvOverride.owner && fromEnvOverride.repo) {
    return fromEnvOverride;
  }

  // 2) GH_REPOSITORY override from parsed .env files (any section)
  if (parsed) {
    const composite = firstNonEmpty(
      parsed.repoVars.GH_REPOSITORY,
      parsed.envVars.GH_REPOSITORY,
      parsed.repoSecrets.GH_REPOSITORY,
      parsed.envSecrets.GH_REPOSITORY
    );
    if (composite && composite.includes('/')) {
      const [owner, rawRepo] = composite.split('/', 2);
      const repo = sanitizeRepoName(rawRepo);
      if (owner && repo) {
        return { owner, repo };
      }
    }
  }

  // 3) GH_OWNER/GH_REPO from parsed .env
  const fromParsed = parsed ? resolveOwnerRepoFromParsed(parsed) : {};

  // 4) Fill any missing piece from git remote autodetection
  if (!fromParsed.owner || !fromParsed.repo) {
    const fromGit = detectOwnerRepoFromGit();
    return {
      owner: fromParsed.owner ?? fromGit.owner,
      repo: fromParsed.repo ?? fromGit.repo,
    };
  }
  return fromParsed;
}

export function slugifySecretSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

export function deriveSecretIds(repo: string, environment: string): { envSecretId: string; repoSecretId: string } {
  const repoSlug = slugifySecretSegment(repo) || 'repo';
  const envSlug = slugifySecretSegment(environment) || 'env';
  return {
    envSecretId: `${repoSlug}/${envSlug}/env`,
    repoSecretId: `${repoSlug}/repository`,
  };
}
