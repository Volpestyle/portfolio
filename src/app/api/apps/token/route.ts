import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAppTokenAllowedOrigins, issueAppToken } from '@/lib/auth/app-tokens';

const allowedOrigins = new Set(getAppTokenAllowedOrigins());

const buildCorsHeaders = (origin: string | null): HeadersInit => {
  if (!origin || !allowedOrigins.has(origin)) {
    return {};
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
};

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin');
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(origin),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const headers = buildCorsHeaders(origin);
  const session = await auth();
  const email = session?.user?.email ?? null;

  if (!email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  }

  let payload: { app?: string } | null = null;
  try {
    payload = (await request.json()) as { app?: string };
  } catch {
    payload = null;
  }

  const app = payload?.app?.trim();
  if (!app) {
    return NextResponse.json({ error: 'Missing app.' }, { status: 400, headers });
  }

  try {
    const token = await issueAppToken({ app, email });
    return NextResponse.json({ token }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to issue token.';
    return NextResponse.json({ error: message }, { status: 400, headers });
  }
}
