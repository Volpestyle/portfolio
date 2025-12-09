import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { fromEnv } from '@aws-sdk/credential-provider-env';
import { FetchHttpHandler } from '@smithy/fetch-http-handler';

type SecretScope = 'env' | 'repo';

interface SecretsManagerCacheOptions {
  primaryRegion?: string;
  fallbackRegion?: string;
  defaultTtlMs?: number;
}

interface CacheEntry {
  secretId: string;
  raw: string;
  parsed?: Record<string, string>;
  expiresAt: number;
}

interface ResolveSecretValueOptions {
  /**
   * Explicit secret id to read. Overrides scope/env var lookups.
   */
  secretId?: string;
  /**
   * Environment variable that holds the target secret id.
   */
  secretIdEnvVar?: string;
  /**
   * Secret scope. Used when no explicit secret id is provided.
   */
  scope?: SecretScope;
  /**
   * Specific key inside the JSON secret payload. Defaults to the requested key.
   */
  secretKey?: string;
  /**
   * Optional alternate environment variable to read first.
   */
  fallbackEnvVar?: string;
  /**
   * Override cache TTL for this lookup.
   */
  ttlMs?: number;
  /**
   * When true, throws if the secret is missing.
   */
  required?: boolean;
  /**
   * Override the primary region for this lookup. Useful for Lambda@Edge.
   */
  region?: string;
  /**
   * Optional fallback region to attempt when the primary region fails.
   */
  fallbackRegion?: string;
}

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 4; // 4 hours
const SCOPE_ENV_FALLBACKS: Record<SecretScope, string[]> = {
  env: ['SECRETS_MANAGER_ENV_SECRET_ID'],
  repo: ['SECRETS_MANAGER_REPO_SECRET_ID'],
};

export class SecretsManagerCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<CacheEntry>>();
  private readonly clients = new Map<string, SecretsManagerClient>();

  private readonly primaryRegion: string;
  private readonly fallbackRegion?: string;
  private readonly defaultTtlMs: number;

  constructor(options: SecretsManagerCacheOptions = {}) {
    this.primaryRegion =
      options.primaryRegion ?? process.env.AWS_SECRETS_MANAGER_PRIMARY_REGION ?? process.env.AWS_REGION ?? 'us-east-1';

    const fallback = options.fallbackRegion ?? process.env.AWS_SECRETS_MANAGER_FALLBACK_REGION;

    this.fallbackRegion = fallback && fallback !== this.primaryRegion ? fallback : undefined;

    const ttlEnv = Number.parseInt(process.env.AWS_SECRETS_MANAGER_CACHE_TTL_MS ?? '', 10);
    this.defaultTtlMs = Number.isFinite(ttlEnv) && ttlEnv > 0 ? ttlEnv : (options.defaultTtlMs ?? DEFAULT_TTL_MS);
  }

  private getClient(region: string): SecretsManagerClient {
    const existing = this.clients.get(region);
    if (existing) {
      return existing;
    }
    const client = new SecretsManagerClient({
      region,
      maxAttempts: 2,
      // Use environment variable credentials - Lambda injects AWS_ACCESS_KEY_ID,
      // AWS_SECRET_ACCESS_KEY, and AWS_SESSION_TOKEN from the execution role.
      credentials: fromEnv(),
      // FetchHttpHandler works in both Node (>=18) and the Edge runtime, so we
      // don't pull in the node-only http/https modules that Edge can't bundle.
      requestHandler: new FetchHttpHandler({
        requestTimeout: 2_500,
        keepAlive: false,
      }),
    });
    this.clients.set(region, client);
    return client;
  }

  async getSecretObject(secretId: string, ttlMs?: number): Promise<Record<string, string>> {
    const entry = await this.fetch(secretId, ttlMs);
    if (entry.parsed) {
      return entry.parsed;
    }

    try {
      const parsed = JSON.parse(entry.raw) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        const normalized: Record<string, string> = {};
        for (const [key, value] of Object.entries(parsed)) {
          if (value === undefined || value === null) {
            continue;
          }
          normalized[key] = typeof value === 'string' ? value : JSON.stringify(value);
        }
        entry.parsed = normalized;
        this.cache.set(entry.secretId, entry);
        return normalized;
      }
    } catch {
      // fall-through to treat payload as opaque string
    }

    entry.parsed = { value: entry.raw };
    this.cache.set(entry.secretId, entry);
    return entry.parsed;
  }

  async getSecretValue(secretId: string, key: string, ttlMs?: number): Promise<string | undefined> {
    const payload = await this.getSecretObject(secretId, ttlMs);
    return payload[key];
  }

  private async fetch(secretId: string, ttlMs?: number): Promise<CacheEntry> {
    const now = Date.now();
    const cached = this.cache.get(secretId);
    if (cached && cached.expiresAt > now) {
      return cached;
    }

    const inflight = this.inflight.get(secretId);
    if (inflight) {
      return inflight;
    }

    const promise = this.load(secretId)
      .then((raw) => {
        const effectiveTtl = ttlMs ?? this.defaultTtlMs;
        const jitter = Math.min(30_000, Math.floor(effectiveTtl * 0.1 * Math.random()));
        const refreshedAt = Date.now();
        const entry: CacheEntry = {
          secretId,
          raw,
          expiresAt: refreshedAt + Math.max(0, effectiveTtl - jitter),
        };
        this.cache.set(secretId, entry);
        return entry;
      })
      .catch((error) => {
        if (cached) {
          const reason = error instanceof Error ? error.message : String(error);
          console.warn(`[SecretsManagerCache] Using stale secret for ${secretId}: ${reason}`);
          return cached;
        }
        throw error;
      })
      .finally(() => {
        this.inflight.delete(secretId);
      });

    this.inflight.set(secretId, promise);
    return promise;
  }

  private async load(secretId: string): Promise<string> {
    try {
      return await this.loadFromRegion(this.primaryRegion, secretId);
    } catch (primaryError) {
      if (!this.fallbackRegion) {
        throw primaryError;
      }

      console.warn(
        `[SecretsManagerCache] Primary region ${this.primaryRegion} failed for ${secretId}. Falling back to ${this.fallbackRegion}.`
      );

      try {
        return await this.loadFromRegion(this.fallbackRegion, secretId);
      } catch (fallbackError) {
        const aggregate = new Error(
          `Unable to load secret ${secretId} from ${this.primaryRegion} or ${this.fallbackRegion}.`
        );
        (aggregate as Error & { cause?: unknown }).cause = { primaryError, fallbackError };
        throw aggregate;
      }
    }
  }

  private async loadFromRegion(region: string, secretId: string): Promise<string> {
    const client = this.getClient(region);
    const response = await client.send(new GetSecretValueCommand({ SecretId: secretId }));

    if (typeof response.SecretString === 'string') {
      return response.SecretString;
    }

    if (response.SecretBinary) {
      try {
        const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { fatal: true }) : undefined;
        if (decoder) {
          return decoder.decode(response.SecretBinary);
        }
      } catch {
        // fall through to base64 fallback when the payload is not valid UTF-8.
      }
      return Buffer.from(response.SecretBinary).toString('base64');
    }

    throw new Error(`Secret ${secretId} did not include a SecretString or SecretBinary payload.`);
  }
}

const cacheKeyForRegions = (primary?: string, fallback?: string): string => `${primary ?? ''}|${fallback ?? ''}`;

const getCacheRegistry = (): Record<string, SecretsManagerCache> => {
  if (!globalThis.__portfolioSecretsCaches) {
    globalThis.__portfolioSecretsCaches = {};
  }
  return globalThis.__portfolioSecretsCaches;
};

function getCacheFor(options?: { region?: string; fallbackRegion?: string }): SecretsManagerCache {
  const primary = options?.region;
  const fallback = options?.fallbackRegion;
  const key = cacheKeyForRegions(primary, fallback);
  const registry = getCacheRegistry();
  const existing = registry[key];

  if (existing) {
    return existing;
  }

  const cache = new SecretsManagerCache({
    primaryRegion: primary,
    fallbackRegion: fallback,
  });

  registry[key] = cache;
  return cache;
}

function resolveSecretId(options: ResolveSecretValueOptions): string | undefined {
  if (options.secretId) {
    return options.secretId;
  }

  if (options.secretIdEnvVar) {
    const explicit = process.env[options.secretIdEnvVar];
    if (explicit) {
      return explicit;
    }
  }

  const scope = options.scope ?? 'env';
  for (const candidate of SCOPE_ENV_FALLBACKS[scope]) {
    const resolved = process.env[candidate];
    if (resolved) {
      return resolved;
    }
  }

  return undefined;
}

export async function resolveSecretValue(
  key: string,
  options: ResolveSecretValueOptions = {}
): Promise<string | undefined> {
  const fallbackKeys = new Set<string>([key, ...(options.fallbackEnvVar ? [options.fallbackEnvVar] : [])]);

  for (const envKey of fallbackKeys) {
    const envValue = process.env[envKey];
    if (typeof envValue === 'string' && envValue.length > 0) {
      return envValue;
    }
  }

  const secretId = resolveSecretId(options);
  if (!secretId) {
    if (options.required) {
      throw new Error(`Missing secret id to resolve value for key '${key}'.`);
    }
    return undefined;
  }

  const cache = getCacheFor({ region: options.region, fallbackRegion: options.fallbackRegion });
  const secretKey = options.secretKey ?? key;
  const value = await cache.getSecretValue(secretId, secretKey, options.ttlMs);

  if (!value && options.required) {
    throw new Error(`Secret '${secretId}' does not include a value for key '${secretKey}'.`);
  }

  return value;
}

declare global {
  var __portfolioSecretsCaches: Record<string, SecretsManagerCache> | undefined;
}
