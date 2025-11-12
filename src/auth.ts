import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import { isAdminEmail } from '@/lib/auth/allowlist';
import { resolveSecretValue } from '@/lib/secrets/manager';

type AuthSecrets = {
  nextAuthSecret: string;
  googleClientSecret?: string | null;
  githubClientSecret?: string | null;
};

const providerConfig = {
  googleId: process.env.GOOGLE_CLIENT_ID ?? null,
  githubId: process.env.GH_CLIENT_ID ?? null,
};

async function loadAuthSecrets(): Promise<AuthSecrets> {
  const [nextAuthSecret, googleClientSecret, githubClientSecret] = await Promise.all([
    resolveSecretValue('NEXTAUTH_SECRET', { scope: 'repo', required: true }),
    providerConfig.googleId ? resolveSecretValue('GOOGLE_CLIENT_SECRET', { scope: 'env' }) : Promise.resolve(null),
    providerConfig.githubId ? resolveSecretValue('GH_CLIENT_SECRET', { scope: 'env' }) : Promise.resolve(null),
  ]);

  if (!nextAuthSecret) {
    throw new Error('NEXTAUTH_SECRET is required to initialize Auth.js.');
  }

  return {
    nextAuthSecret,
    googleClientSecret,
    githubClientSecret,
  };
}

const authSecrets = await loadAuthSecrets();

function buildProviders(secrets: AuthSecrets) {
  const providers = [];

  if (providerConfig.googleId) {
    if (!secrets.googleClientSecret) {
      throw new Error('GOOGLE_CLIENT_SECRET must be set when GOOGLE_CLIENT_ID is provided.');
    }
    providers.push(
      Google({
        clientId: providerConfig.googleId,
        clientSecret: secrets.googleClientSecret,
        authorization: {
          params: {
            prompt: 'select_account',
          },
        },
      })
    );
  }

  if (providerConfig.githubId) {
    if (!secrets.githubClientSecret) {
      throw new Error('GH_CLIENT_SECRET must be set when GH_CLIENT_ID is provided.');
    }
    providers.push(
      GitHub({
        clientId: providerConfig.githubId,
        clientSecret: secrets.githubClientSecret,
        authorization: {
          params: {
            scope: 'read:user user:email',
          },
        },
      })
    );
  }

  if (!providers.length) {
    throw new Error('No OAuth providers configured for NextAuth. Set GOOGLE_* or GITHUB_* env vars.');
  }

  return providers;
}

function extractFlag(source: unknown, keys: string[]): unknown {
  if (!source || typeof source !== 'object') {
    return undefined;
  }
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }
  return undefined;
}

function isVerifiedUser(user?: unknown, profile?: unknown): boolean {
  const raw =
    extractFlag(user, ['emailVerified', 'email_verified']) ??
    extractFlag(profile, ['email_verified', 'verified', 'emailVerified', 'email_verified_at']);

  if (raw === undefined || raw === null) {
    return true;
  }
  if (typeof raw === 'boolean') {
    return raw;
  }
  if (raw instanceof Date) {
    return !Number.isNaN(raw.getTime());
  }
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
    return true;
  }
  return true;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  secret: authSecrets.nextAuthSecret,
  trustHost: true,
  providers: buildProviders(authSecrets),
  callbacks: {
    async jwt({ token, user, profile }) {
      token.email ??= user?.email ?? profile?.email ?? token.email;
      return token;
    },
    async session({ session, token }) {
      if (typeof token.email === 'string') {
        session.user = {
          ...session.user,
          email: token.email,
        };
      }
      return session;
    },
    async signIn({ user, profile }) {
      const email = (user?.email ?? profile?.email ?? null) as string | null;
      if (!email) {
        return false;
      }
      if (!isVerifiedUser(user, profile)) {
        return false;
      }
      return isAdminEmail(email);
    },
  },
});
