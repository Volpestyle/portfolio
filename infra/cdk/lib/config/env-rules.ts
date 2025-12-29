export type EdgeEnvRules = {
  prefixes: string[];
  explicitKeys: Set<string>;
  blocklist: Set<string>;
};

const splitList = (value?: string) =>
  value
    ? value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
    : [];

const defaultExplicitEdgeKeys = [
  'NODE_ENV',
  'APP_ENV',
  'APP_STAGE',
  'ALLOW_TEST_FIXTURES_IN_PROD',
  'BLOG_TEST_FIXTURES',
  'PORTFOLIO_TEST_FIXTURES',
  'APP_HOST',
  'AWS_REGION',
  'CACHE_BUCKET_NAME',
  'CACHE_BUCKET_KEY_PREFIX',
  'CACHE_BUCKET_REGION',
  'CACHE_DYNAMO_TABLE',
  'COST_TABLE_NAME',
  'REVALIDATION_QUEUE_URL',
  'REVALIDATION_QUEUE_REGION',
  'BUCKET_NAME',
  'BUCKET_KEY_PREFIX',
  'POSTS_TABLE',
  'POSTS_STATUS_INDEX',
  'CONTENT_BUCKET',
  'MEDIA_BUCKET',
  'CHAT_EXPORT_BUCKET',
  'CLOUDFRONT_DISTRIBUTION_ID',
  'NEXTAUTH_URL',
  'GH_CLIENT_ID',
  'GOOGLE_CLIENT_ID',
  'ADMIN_EMAILS',
  'ADMIN_TABLE_NAME',
  'PORTFOLIO_GIST_ID',
  'APP_JWT_ALLOWED_APPS',
  'APP_JWT_ALLOWED_ORIGINS',
  'APP_JWT_ISSUER',
  'APP_JWT_AUDIENCE',
  'APP_JWT_TTL_SECONDS',
  'APP_JWT_KEY_ID',
  'APP_JWT_ALG',
];

const defaultEdgeBlocklist = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'SECRETS_MANAGER_ENV_SECRET_ID',
  'SECRETS_MANAGER_REPO_SECRET_ID',
  'AWS_SECRETS_MANAGER_PRIMARY_REGION',
  'AWS_SECRETS_MANAGER_FALLBACK_REGION',
  'OPENAI_API_KEY',
  'GH_TOKEN',
  'REVALIDATE_SECRET',
  'NEXTAUTH_SECRET',
  'GH_CLIENT_SECRET',
  'GOOGLE_CLIENT_SECRET',
  'DATABASE_URL',
  'API_KEY',
];

export const defaultEdgeEnvPrefixes = ['NEXT_PUBLIC_'];

export function resolveEdgeRuntimeEnvRules(runtimeEnvironment: Record<string, string>): EdgeEnvRules {
  const configuredPrefixes = splitList(runtimeEnvironment['EDGE_RUNTIME_ENV_PREFIXES']);
  const prefixes = Array.from(new Set([...defaultEdgeEnvPrefixes, ...configuredPrefixes]));

  const configuredKeys = splitList(runtimeEnvironment['EDGE_RUNTIME_ENV_KEYS']);
  const explicitKeys = new Set<string>([...defaultExplicitEdgeKeys, ...configuredKeys]);

  const blocklist = new Set<string>(defaultEdgeBlocklist);
  for (const key of splitList(runtimeEnvironment['EDGE_RUNTIME_ENV_BLOCKLIST'])) {
    blocklist.add(key);
  }

  return {
    prefixes,
    explicitKeys,
    blocklist,
  };
}

export function buildEnvironmentFromRules(
  source: Record<string, string>,
  rules: EdgeEnvRules
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) {
      continue;
    }
    if (rules.blocklist.has(key)) {
      continue;
    }
    const isExplicit = rules.explicitKeys.has(key);
    const matchesPrefix = rules.prefixes.some((prefix) => key.startsWith(prefix));
    if (!isExplicit && !matchesPrefix) {
      continue;
    }
    env[key] = value;
  }
  return env;
}
