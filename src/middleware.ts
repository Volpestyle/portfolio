import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { isAdminEmail } from '@/lib/auth/allowlist';
import { hasAdminBypass } from '@/lib/test-mode';

export async function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  if (hasAdminBypass(req.headers)) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email || !isAdminEmail(String(token.email))) {
    return NextResponse.redirect(new URL('/api/auth/signin', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
