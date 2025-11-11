import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import { isAdminEmail } from '@/lib/auth/allowlist';

function buildProviders() {
  const providers = [];
  const googleId = process.env.GOOGLE_CLIENT_ID;
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (googleId && googleSecret) {
    providers.push(
      Google({
        clientId: googleId,
        clientSecret: googleSecret,
        authorization: {
          params: {
            prompt: 'select_account',
          },
        },
      })
    );
  }

  const githubId = process.env.GH_CLIENT_ID;
  const githubSecret = process.env.GH_CLIENT_SECRET;
  if (githubId && githubSecret) {
    providers.push(
      GitHub({
        clientId: githubId,
        clientSecret: githubSecret,
      })
    );
  }

  if (!providers.length) {
    throw new Error('No OAuth providers configured for NextAuth. Set GOOGLE_* or GITHUB_* env vars.');
  }

  return providers;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  providers: buildProviders(),
  callbacks: {
    async jwt({ token, profile }) {
      if (profile?.email) {
        token.email = profile.email;
      }
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
    async signIn({ profile }) {
      return isAdminEmail(profile?.email ?? null);
    },
  },
});
