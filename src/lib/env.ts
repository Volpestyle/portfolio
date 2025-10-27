const ENV_ALIASES = {
  OPENAI_API_KEY: ['OPENAI_API_KEY'],
  GH_TOKEN: ['GH_TOKEN'],
  SECRET_ACCESS_KEY: ['SECRET_ACCESS_KEY'],
  UPSTASH_REDIS_REST_TOKEN: ['UPSTASH_REDIS_REST_TOKEN'],
} as const;

type KnownEnvKey = keyof typeof ENV_ALIASES;

function getAliases(key: KnownEnvKey | string): string[] {
  const aliases = ENV_ALIASES[key as KnownEnvKey];
  if (aliases && aliases.length > 0) {
    return [...aliases];
  }
  return [key];
}

function assignCanonicalValue(candidates: string[], sourceKey: string, value: string) {
  const canonical = candidates[0];
  if (!canonical) {
    return;
  }

  if (!process.env[canonical] || canonical === sourceKey) {
    process.env[canonical] = value;
  }
}

export function resolveEnv(key: KnownEnvKey | string): string | null {
  const candidates = getAliases(key);
  for (const candidate of candidates) {
    const value = process.env[candidate];
    if (typeof value === 'string' && value.length > 0) {
      assignCanonicalValue(candidates, candidate, value);
      return value;
    }
  }
  return null;
}

export function requireEnv(key: KnownEnvKey | string, errorMessage?: string): string {
  const value = resolveEnv(key);
  if (!value) {
    throw new Error(errorMessage ?? `${key} is not configured`);
  }
  return value;
}

export function envExists(key: KnownEnvKey | string): boolean {
  return resolveEnv(key) !== null;
}

export type { KnownEnvKey };
