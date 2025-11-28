import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isAdminEmail } from '@/lib/auth/allowlist';
import { hasAdminBypass } from '@/lib/test-flags';

export default auth((req) => {
  if (!req.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  if (hasAdminBypass(req.headers)) {
    return NextResponse.next();
  }

  const email = req.auth?.user?.email;
  if (!email || !isAdminEmail(email)) {
    const url = new URL('/api/auth/signin', req.url);
    url.searchParams.set('callbackUrl', req.nextUrl.href);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/admin/:path*'],
};
