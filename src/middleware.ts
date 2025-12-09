import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isAdminEmail } from '@/lib/auth/allowlist';
import { hasAdminBypass } from '@/lib/test-flags';

export default auth((req) => {
  const pathname = req.nextUrl.pathname;
  const isAdminPage = pathname.startsWith('/admin');
  const isAdminApi = pathname.startsWith('/api/admin');
  const isDebugPage = pathname.startsWith('/debug');
  const isDebugApi = pathname.startsWith('/api/debug');

  if (!isAdminPage && !isAdminApi && !isDebugPage && !isDebugApi) {
    return NextResponse.next();
  }

  if (hasAdminBypass(req.headers)) {
    return NextResponse.next();
  }

  const email = req.auth?.user?.email;
  if (!email || !isAdminEmail(email)) {
    // For API routes, return JSON error instead of redirect
    if (isAdminApi) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // For admin pages, redirect to sign in
    const url = new URL('/api/auth/signin', req.url);
    url.searchParams.set('callbackUrl', req.nextUrl.href);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*', '/debug/:path*', '/api/debug/:path*'],
};
