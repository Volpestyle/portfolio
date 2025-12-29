import { SignJWT, calculateJwkThumbprint, exportJWK, importPKCS8, importSPKI, type JWK, type KeyLike } from 'jose';
import { resolveSecretValue } from '@/lib/secrets/manager';

const DEFAULT_ALLOWED_APPS = ['yt-channel-expert'];
const DEFAULT_ALLOWED_ORIGINS = [
  'https://yt-channel-expert.jcvolpe.me',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];
const DEFAULT_TTL_SECONDS = 10 * 60;
const DEFAULT_ALG = 'RS256';

export type AppTokenRequest = {
  app: string;
  email: string;
  subject?: string | null;
};

export type AppTokenIssuerConfig = {
  issuer: string;
  audience: string;
  ttlSeconds: number;
  algorithm: string;
  keyId: string;
  allowedApps: Set<string>;
};

let keyCachePromise: Promise<{
  privateKey: KeyLike;
  publicJwk: JWK;
  config: AppTokenIssuerConfig;
}> | null = null;

const parseCsv = (value?: string | null): string[] => {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const parseAllowedApps = (): Set<string> => {
  const raw = parseCsv(process.env.APP_JWT_ALLOWED_APPS);
  const list = raw.length ? raw : DEFAULT_ALLOWED_APPS;
  return new Set(list);
};

export const getAppTokenAllowedOrigins = (): string[] => {
  const raw = parseCsv(process.env.APP_JWT_ALLOWED_ORIGINS);
  return raw.length ? raw : DEFAULT_ALLOWED_ORIGINS;
};

const resolveIssuer = (): string => {
  const issuer = process.env.APP_JWT_ISSUER?.trim();
  if (issuer) return issuer;
  const nextAuthUrl = process.env.NEXTAUTH_URL?.trim();
  if (nextAuthUrl) return nextAuthUrl.replace(/\/$/, '');
  const publicSite = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (publicSite) return publicSite.replace(/\/$/, '');
  return 'https://jcvolpe.me';
};

const resolveAudience = (): string => process.env.APP_JWT_AUDIENCE?.trim() || 'yt-channel-expert.jcvolpe.me';

const resolveTtlSeconds = (): number => {
  const raw = process.env.APP_JWT_TTL_SECONDS?.trim();
  if (!raw) return DEFAULT_TTL_SECONDS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_SECONDS;
};

const resolveAlgorithm = (): string => process.env.APP_JWT_ALG?.trim() || DEFAULT_ALG;

const loadKeys = async () => {
  if (!keyCachePromise) {
    keyCachePromise = (async () => {
      const [privateKeyPem, publicKeyPem, keyId] = await Promise.all([
        resolveSecretValue('APP_JWT_PRIVATE_KEY', { scope: 'repo', required: true }),
        resolveSecretValue('APP_JWT_PUBLIC_KEY', { scope: 'repo', required: true }),
        resolveSecretValue('APP_JWT_KEY_ID', { scope: 'repo' }),
      ]);

      if (!privateKeyPem || !publicKeyPem) {
        throw new Error('APP_JWT_PRIVATE_KEY and APP_JWT_PUBLIC_KEY must be configured.');
      }

      const algorithm = resolveAlgorithm();
      const privateKey = await importPKCS8(privateKeyPem, algorithm);
      const publicKey = await importSPKI(publicKeyPem, algorithm);
      const publicJwk = await exportJWK(publicKey);

      publicJwk.use = 'sig';
      publicJwk.alg = algorithm;
      publicJwk.kid = keyId || (await calculateJwkThumbprint(publicJwk));

      const config: AppTokenIssuerConfig = {
        issuer: resolveIssuer(),
        audience: resolveAudience(),
        ttlSeconds: resolveTtlSeconds(),
        algorithm,
        keyId: publicJwk.kid ?? '',
        allowedApps: parseAllowedApps(),
      };

      return { privateKey, publicJwk, config };
    })();
  }

  return keyCachePromise;
};

export const getAppTokenConfig = async (): Promise<AppTokenIssuerConfig> => {
  const { config } = await loadKeys();
  return config;
};

export const getAppTokenJwks = async (): Promise<{ keys: JWK[] }> => {
  const { publicJwk } = await loadKeys();
  return { keys: [publicJwk] };
};

export const issueAppToken = async ({ app, email, subject }: AppTokenRequest): Promise<string> => {
  const { privateKey, config } = await loadKeys();

  if (!config.allowedApps.has(app)) {
    throw new Error('Unsupported app requested.');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: subject || email,
    email,
    app,
  };

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: config.algorithm, kid: config.keyId })
    .setIssuedAt(now)
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setExpirationTime(now + config.ttlSeconds)
    .sign(privateKey);
};
