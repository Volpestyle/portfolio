# Authentication

The portfolio uses NextAuth.js for authentication with OAuth providers.

## Features

- **OAuth Providers** - GitHub and Google sign-in
- **Session Management** - JWT-based sessions
- **Admin Access Control** - Email-based admin gating
- **Protected Routes** - Middleware for route protection

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          User                                    │
│  ┌─────────────────┐              ┌─────────────────┐           │
│  │   Sign In       │              │   Admin Panel   │           │
│  │   Button        │              │   (Protected)   │           │
│  └────────┬────────┘              └────────┬────────┘           │
└───────────┼────────────────────────────────┼────────────────────┘
            │                                │
            ▼                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       NextAuth.js                                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  OAuth Flow     │  │  JWT Session    │  │  Middleware     │ │
│  │  (GitHub/Google)│  │  Management     │  │  Protection     │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     OAuth Providers                              │
│  ┌─────────────────┐              ┌─────────────────┐           │
│  │     GitHub      │              │     Google      │           │
│  └─────────────────┘              └─────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

## Configuration

### Environment Variables

```bash
# NextAuth.js
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-random-secret-min-32-chars

# GitHub OAuth
GH_CLIENT_ID=your-github-oauth-client-id
GH_CLIENT_SECRET=your-github-oauth-client-secret

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Admin access
ADMIN_EMAILS=admin@example.com,author@example.com
```

### NextAuth Configuration

`src/auth.ts`:

```typescript
import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GH_CLIENT_ID,
      clientSecret: process.env.GH_CLIENT_SECRET,
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.isAdmin = isAdminEmail(user.email);
      }
      return token;
    },
    session({ session, token }) {
      session.user.isAdmin = token.isAdmin;
      return session;
    },
  },
});
```

## OAuth Setup

### GitHub OAuth App

1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Create new OAuth App
3. Set Authorization callback URL: `https://your-domain.com/api/auth/callback/github`
4. Copy Client ID and Client Secret

### Google OAuth

1. Go to Google Cloud Console > APIs & Services > Credentials
2. Create OAuth 2.0 Client ID
3. Add authorized redirect URI: `https://your-domain.com/api/auth/callback/google`
4. Copy Client ID and Client Secret

## Session Management

### JWT Strategy

Sessions stored in encrypted JWTs (no database required):

```typescript
session: {
  strategy: 'jwt',
  maxAge: 30 * 24 * 60 * 60, // 30 days
}
```

### Session Access

Server Component:

```typescript
import { auth } from '@/auth';

export default async function Page() {
  const session = await auth();
  if (!session) {
    return <SignInPrompt />;
  }
  return <Dashboard user={session.user} />;
}
```

Client Component:

```typescript
'use client';
import { useSession } from 'next-auth/react';

export function UserInfo() {
  const { data: session } = useSession();
  if (!session) return null;
  return <span>{session.user.name}</span>;
}
```

## Admin Access Control

### Email-Based Gating

Admins identified by email address:

```typescript
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',');

function isAdminEmail(email: string | null | undefined): boolean {
  return ADMIN_EMAILS.includes(email ?? '');
}
```

### Admin Check in API Routes

```typescript
import { auth } from '@/auth';

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.isAdmin) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Admin-only logic
}
```

### Admin Check in Components

```typescript
import { auth } from '@/auth';

export default async function AdminPanel() {
  const session = await auth();

  if (!session?.user?.isAdmin) {
    redirect('/');
  }

  return <AdminDashboard />;
}
```

## Middleware Protection

`src/middleware.ts`:

```typescript
import { auth } from '@/auth';

export default auth((req) => {
  const isAdminRoute = req.nextUrl.pathname.startsWith('/admin');

  if (isAdminRoute && !req.auth?.user?.isAdmin) {
    return Response.redirect(new URL('/', req.url));
  }
});

export const config = {
  matcher: ['/admin/:path*'],
};
```

## Sign In/Out

### Sign In Button

```typescript
import { signIn } from '@/auth';

export function SignInButton() {
  return (
    <form action={async () => {
      'use server';
      await signIn('github');
    }}>
      <button type="submit">Sign in with GitHub</button>
    </form>
  );
}
```

### Sign Out Button

```typescript
import { signOut } from '@/auth';

export function SignOutButton() {
  return (
    <form action={async () => {
      'use server';
      await signOut();
    }}>
      <button type="submit">Sign out</button>
    </form>
  );
}
```

## Protected API Routes

### Session Validation

```typescript
// src/app/api/admin/blog/posts/route.ts
import { auth } from '@/auth';

export async function GET() {
  const session = await auth();

  if (!session) {
    return new Response('Unauthenticated', { status: 401 });
  }

  if (!session.user.isAdmin) {
    return new Response('Forbidden', { status: 403 });
  }

  // Return admin data
}
```

## Security Considerations

### Secret Generation

Generate a secure `NEXTAUTH_SECRET`:

```bash
openssl rand -base64 32
```

### HTTPS Required

OAuth callbacks require HTTPS in production. Local development uses `http://localhost:3000`.

### Token Security

- JWTs encrypted with `NEXTAUTH_SECRET`
- HttpOnly cookies prevent XSS access
- Secure flag set in production

## Troubleshooting

### Callback URL Mismatch

Ensure OAuth callback URLs match exactly:
- Development: `http://localhost:3000/api/auth/callback/github`
- Production: `https://your-domain.com/api/auth/callback/github`

### Session Not Persisting

Check `NEXTAUTH_URL` matches your domain:

```bash
NEXTAUTH_URL=https://your-domain.com
```

### Admin Access Not Working

Verify email format in `ADMIN_EMAILS`:
- No spaces around commas
- Exact email match (case-sensitive)

## Related Documentation

- [Blog Admin](./blog/overview.md) - Admin dashboard access
- [Deployment](../deployment/environments.md) - Production secrets
