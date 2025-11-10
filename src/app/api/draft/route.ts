import { draftMode } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isAdminEmail } from '@/lib/auth/allowlist';

async function ensureAdmin(): Promise<boolean> {
  const session = await auth();
  const email = session?.user?.email ?? null;
  return Boolean(email && isAdminEmail(email));
}

function buildRedirectResponse(target?: string | null) {
  if (!target || !target.startsWith('/')) {
    return NextResponse.json({ ok: true });
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  try {
    const url = new URL(target, base);
    return NextResponse.redirect(url, { status: 307 });
  } catch {
    return NextResponse.json({ ok: true });
  }
}

export async function GET(req: Request) {
  if (!(await ensureAdmin())) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  (await draftMode()).enable();
  return buildRedirectResponse(searchParams.get('redirect'));
}

export async function DELETE() {
  if (!(await ensureAdmin())) {
    return new Response('Unauthorized', { status: 401 });
  }

  (await draftMode()).disable();
  return NextResponse.json({ ok: true });
}
