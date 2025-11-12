import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user?: DefaultSession['user'] & {
      email?: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    email?: string | null;
  }
}
